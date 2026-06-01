import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Download, Mail, Loader2, AlertTriangle } from "lucide-react";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { InvoiceDocument, type InvoiceDocumentData } from "./invoice-document";
import { formatMoney } from "@/features/orders/order-items-editor";

type Order = {
  id: string;
  brand_id: string;
  order_number: string;
  invoice_number: string | null;
  sale_date: string | null;
  payment_method: string | null;
  notes: string | null;
  subtotal: number; discount: number; tax: number; total: number;
  advance_amount: number;
  customer_name: string | null;
  customer_company: string | null;
  customer_doc_type: string | null;
  customer_doc_number: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  customer_city: string | null;
  customer_department: string | null;
  items: Array<{
    description: string; quantity: number; unit_price: number; line_total: number; sort_order: number;
  }>;
};

export function InvoicePanel({ order }: { order: Order }) {
  const qc = useQueryClient();

  const invoiceQuery = useQuery({
    queryKey: ["invoice", order.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, issued_at, pdf_path, total_snapshot, balance_snapshot, sent_at, send_count")
        .eq("order_id", order.id)
        .order("issued_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const issueMutation = useMutation({
    mutationFn: async () => {
      if (!order.invoice_number) {
        throw new Error("Esta venta no tiene número de factura asignado.");
      }
      if (!order.items?.length) throw new Error("Agrega al menos un producto antes de facturar.");
      if (Number(order.total) <= 0) throw new Error("El total de la venta debe ser mayor a cero.");
      if (!order.customer_name) throw new Error("El cliente debe tener al menos un nombre.");

      // Fetch brand & active terms in parallel
      const [brandRes, termsRes, userRes] = await Promise.all([
        supabase.from("brands").select("*").eq("id", order.brand_id).maybeSingle(),
        supabase.from("terms_versions").select("id, version, content_html").eq("is_active", true).maybeSingle(),
        supabase.auth.getUser(),
      ]);
      if (brandRes.error) throw brandRes.error;
      if (termsRes.error) throw termsRes.error;
      const brand = brandRes.data;
      const terms = termsRes.data;
      if (!brand) throw new Error("No se pudo cargar la marca emisora.");

      const sortedItems = order.items.slice().sort((a, b) => a.sort_order - b.sort_order);
      const total = Number(order.total);
      const advance = Number(order.advance_amount || 0);
      const balance = Math.max(0, total - advance);

      const data: InvoiceDocumentData = {
        invoice_number: order.invoice_number,
        order_number: order.order_number,
        issued_at: new Date().toISOString(),
        sale_date: order.sale_date,
        payment_method: order.payment_method,
        notes: order.notes,
        brand: {
          name: brand.name,
          legal_name: brand.legal_name,
          tax_id: brand.tax_id,
          address: (brand as any).address ?? null,
          city: (brand as any).city ?? null,
          phone: (brand as any).phone ?? null,
          email: (brand as any).email ?? null,
          website: (brand as any).website ?? null,
          logo_url: brand.logo_url,
          primary_color: brand.primary_color,
          invoice_footer_note: (brand as any).invoice_footer_note ?? null,
        },
        customer: {
          name: order.customer_name,
          company: order.customer_company,
          doc_type: order.customer_doc_type,
          doc_number: order.customer_doc_number,
          phone: order.customer_phone,
          email: order.customer_email,
          address: order.customer_address,
          city: order.customer_city,
          department: order.customer_department,
        },
        items: sortedItems.map((it) => ({
          description: it.description,
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          line_total: Number(it.line_total),
        })),
        subtotal: Number(order.subtotal),
        discount: Number(order.discount),
        tax: Number(order.tax),
        total,
        advance,
        balance,
        terms_html: terms?.content_html ?? null,
        terms_version: terms?.version ?? null,
      };

      // Generate PDF
      const blob = await pdf(<InvoiceDocument data={data} />).toBlob();

      // Upload to storage
      const ts = Date.now();
      const path = `${order.brand_id}/${order.id}-${order.invoice_number}-${ts}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("invoices")
        .upload(path, blob, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;

      // Insert invoice row (snapshots)
      const userEmail = userRes.data.user?.email ?? null;
      const userId = userRes.data.user?.id ?? null;
      const { error: insErr } = await supabase.from("invoices").insert({
        order_id: order.id,
        brand_id: order.brand_id,
        invoice_number: order.invoice_number,
        terms_version_id: terms?.id ?? null,
        terms_snapshot_html: terms?.content_html ?? null,
        pdf_path: path,
        issued_by: userId,
        issued_by_email: userEmail,
        subtotal_snapshot: order.subtotal,
        discount_snapshot: order.discount,
        tax_snapshot: order.tax,
        total_snapshot: total,
        advance_snapshot: advance,
        balance_snapshot: balance,
        brand_snapshot: data.brand,
        customer_snapshot: data.customer,
        items_snapshot: data.items,
      });
      if (insErr) throw insErr;

      // Open the just-uploaded PDF in a new tab
      const { data: signed } = await supabase.storage.from("invoices").createSignedUrl(path, 60 * 10);
      if (signed?.signedUrl) window.open(signed.signedUrl, "_blank", "noopener");

      return path;
    },
    onSuccess: () => {
      toast.success("Factura emitida");
      qc.invalidateQueries({ queryKey: ["invoice", order.id] });
      qc.invalidateQueries({ queryKey: ["order-audit", order.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadMutation = useMutation({
    mutationFn: async (path: string) => {
      const { data, error } = await supabase.storage.from("invoices").createSignedUrl(path, 60 * 10);
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const issued = invoiceQuery.data;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">Facturación</p>
      </div>

      {invoiceQuery.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : issued ? (
        <div className="space-y-3 text-sm">
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Factura</p>
            <p className="font-semibold text-base">{issued.invoice_number}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Emitida {new Date(issued.issued_at).toLocaleString("es-CO")}
            </p>
            <div className="mt-2 flex justify-between text-xs">
              <span className="text-muted-foreground">Total</span>
              <span className="tabular-nums">{formatMoney(issued.total_snapshot)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Saldo</span>
              <span className="tabular-nums font-medium">{formatMoney(issued.balance_snapshot)}</span>
            </div>
          </div>

          <Button
            variant="outline" size="sm" className="w-full gap-2"
            onClick={() => issued.pdf_path && downloadMutation.mutate(issued.pdf_path)}
            disabled={!issued.pdf_path || downloadMutation.isPending}
          >
            <Download className="h-4 w-4" /> Descargar PDF
          </Button>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="block">
                  <Button variant="outline" size="sm" className="w-full gap-2" disabled>
                    <Mail className="h-4 w-4" /> Reenviar al cliente
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Disponible cuando se configure el dominio + Resend
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {issued.sent_at ? (
            <p className="text-[11px] text-muted-foreground">
              Último envío: {new Date(issued.sent_at).toLocaleString("es-CO")} ({issued.send_count})
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground italic">
              Aún no se ha enviado por correo.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {!order.invoice_number && (
            <div className="flex gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Asigna un número de factura a esta venta antes de emitir.</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Genera el PDF de factura con el detalle actual de la venta y los Términos y Condiciones vigentes. Una vez emitida queda inmutable.
          </p>
          <Button
            size="sm" className="w-full gap-2"
            onClick={() => issueMutation.mutate()}
            disabled={issueMutation.isPending || !order.invoice_number}
          >
            {issueMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Emitiendo…</>
            ) : (
              <><FileText className="h-4 w-4" /> Emitir factura</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
