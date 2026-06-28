import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { renderInvoiceEmail } from "@/lib/email-templates/invoice-html";

/**
 * Envío de cuentas de cobro por correo vía Resend.
 * Dominio técnico: mail.grupogetova.com (verificado).
 * Display: Grupo Getova <info@grupogetova.com>
 */
export const sendInvoiceEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      invoice_id: z.string().uuid(),
      to: z.string().email(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY no está configurada.");
    }

    const { supabase, userId } = context;

    // Cargar cuenta de cobro + marca
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id, invoice_number, pdf_path, total_snapshot, balance_snapshot, customer_snapshot, brand_id, send_count")
      .eq("id", data.invoice_id)
      .single();
    if (invErr || !invoice) throw new Error("Cuenta de cobro no encontrada.");

    const { data: brand, error: brandErr } = await supabase
      .from("brands")
      .select("name, primary_color, email, phone")
      .eq("id", invoice.brand_id)
      .single();
    if (brandErr || !brand) throw new Error("Marca no encontrada.");

    if (!invoice.pdf_path) throw new Error("La cuenta de cobro no tiene PDF generado.");
    const { data: pdfBlob, error: dlErr } = await supabase.storage
      .from("invoices")
      .download(invoice.pdf_path);
    if (dlErr || !pdfBlob) throw new Error("No se pudo descargar el PDF.");
    const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());

    // Cargar términos y condiciones activos y generar PDF adjunto
    const { data: terms } = await supabase
      .from("terms_versions")
      .select("title, content_html, version")
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    let termsAttachment: { filename: string; content: string } | null = null;
    if (terms) {
      const { buildTermsPdf } = await import("@/lib/terms-pdf.server");
      const termsBytes = await buildTermsPdf({
        title: terms.title,
        content: terms.content_html,
        version: terms.version,
        brand_name: brand.name,
        brand_color: brand.primary_color,
      });
      termsAttachment = {
        filename: `Terminos-y-Condiciones-v${terms.version}.pdf`,
        content: Buffer.from(termsBytes).toString("base64"),
      };
    }

    const customer = (invoice.customer_snapshot ?? {}) as { name?: string | null };
    const fmt = (n: number) =>
      new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(n));

    const html = renderInvoiceEmail({
      customer_name: customer.name || "Cliente",
      brand_name: brand.name,
      invoice_number: invoice.invoice_number ?? "",
      total_formatted: fmt(invoice.total_snapshot),
      balance_formatted: fmt(invoice.balance_snapshot),
      brand_color: brand.primary_color || undefined,
      brand_email: brand.email,
      brand_phone: brand.phone,
    });

    const attachments: Array<{ filename: string; content: string }> = [
      {
        filename: `Cuenta-de-cobro-${invoice.invoice_number}.pdf`,
        content: pdfBuffer.toString("base64"),
      },
    ];
    if (termsAttachment) attachments.push(termsAttachment);

    // Enviar vía Resend
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${brand.name} <info@mail.grupogetova.com>`,
        to: [data.to],
        reply_to: "info@grupogetova.com",
        subject: `Cuenta de cobro ${invoice.invoice_number} — ${brand.name}`,
        html,
        attachments,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Resend ${resp.status}: ${body.slice(0, 300)}`);
    }

    const result = (await resp.json()) as { id?: string };

    // Actualizar cuenta de cobro
    await supabase
      .from("invoices")
      .update({
        sent_at: new Date().toISOString(),
        sent_to: data.to,
        send_count: (invoice.send_count ?? 0) + 1,
      })
      .eq("id", invoice.id);

    return { status: "sent" as const, message_id: result.id, to: data.to, sent_by: userId };
  });
