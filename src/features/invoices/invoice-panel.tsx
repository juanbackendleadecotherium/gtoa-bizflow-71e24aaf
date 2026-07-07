import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Download, Mail, Loader2, AlertTriangle, RefreshCw, History, Clock } from "lucide-react";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { sendInvoiceEmail } from "@/lib/invoices.functions";
import type { InvoiceDocumentData, InvoiceItemSnapshot } from "./invoice-document";
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
    is_gift?: boolean | null;
  }>;
};

type VersionRow = {
  id: string;
  version_number: number;
  pdf_path: string;
  created_at: string;
  issued_by_email: string | null;
  subtotal_snapshot: number;
  discount_snapshot: number;
  tax_snapshot: number;
  total_snapshot: number;
  advance_snapshot: number;
  balance_snapshot: number;
  items_snapshot: InvoiceItemSnapshot[] | null;
  change_summary: string | null;
};

function diffSummary(prev: VersionRow | null, next: {
  subtotal: number; discount: number; tax: number; total: number; advance: number;
  items: InvoiceItemSnapshot[];
}): string {
  if (!prev) return "Versión inicial";
  const changes: string[] = [];
  const money = (n: number) => formatMoney(Number(n));
  const fields: Array<[string, number, number]> = [
    ["Subtotal", Number(prev.subtotal_snapshot), next.subtotal],
    ["Descuento", Number(prev.discount_snapshot), next.discount],
    ["Impuesto", Number(prev.tax_snapshot), next.tax],
    ["Total", Number(prev.total_snapshot), next.total],
    ["Abono", Number(prev.advance_snapshot), next.advance],
  ];
  for (const [label, a, b] of fields) {
    if (Math.abs(a - b) > 0.001) changes.push(`${label}: ${money(a)} → ${money(b)}`);
  }
  const prevCount = Array.isArray(prev.items_snapshot) ? prev.items_snapshot.length : 0;
  if (prevCount !== next.items.length) {
    changes.push(`Productos: ${prevCount} → ${next.items.length}`);
  } else if (Array.isArray(prev.items_snapshot)) {
    let modified = 0;
    for (let i = 0; i < next.items.length; i++) {
      const a = prev.items_snapshot[i]; const b = next.items[i];
      if (!a || a.description !== b.description ||
          Number(a.quantity) !== Number(b.quantity) ||
          Number(a.unit_price) !== Number(b.unit_price)) modified++;
    }
    if (modified > 0) changes.push(`${modified} producto${modified === 1 ? "" : "s"} modificado${modified === 1 ? "" : "s"}`);
  }
  return changes.length ? changes.join(" · ") : "Regeneración sin cambios numéricos";
}

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

  const versionsQuery = useQuery({
    queryKey: ["invoice-versions", invoiceQuery.data?.id],
    enabled: !!invoiceQuery.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_versions")
        .select("id, version_number, pdf_path, created_at, issued_by_email, subtotal_snapshot, discount_snapshot, tax_snapshot, total_snapshot, advance_snapshot, balance_snapshot, items_snapshot, change_summary")
        .eq("invoice_id", invoiceQuery.data!.id)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return (data || []) as VersionRow[];
    },
  });

  const issueMutation = useMutation({
    mutationFn: async () => {
      if (!order.invoice_number) throw new Error("Esta venta no tiene número de cuenta de cobro asignado.");
      if (!order.items?.length) throw new Error("Agrega al menos un producto antes de emitir la cuenta de cobro.");
      if (Number(order.total) <= 0) throw new Error("El total de la venta debe ser mayor a cero.");
      if (!order.customer_name) throw new Error("El cliente debe tener al menos un nombre.");

      const [brandRes, userRes, existingRes, latestVersionRes, paymentsRes] = await Promise.all([
        supabase.from("brands").select("*").eq("id", order.brand_id).maybeSingle(),
        supabase.auth.getUser(),
        supabase.from("invoices").select("id, pdf_path").eq("order_id", order.id).maybeSingle(),
        supabase.from("invoice_versions")
          .select("version_number, subtotal_snapshot, discount_snapshot, tax_snapshot, total_snapshot, advance_snapshot, balance_snapshot, items_snapshot")
          .eq("order_id", order.id)
          .order("version_number", { ascending: false })
          .limit(1).maybeSingle(),
        supabase.from("order_payments").select("amount").eq("order_id", order.id),
      ]);
      if (brandRes.error) throw brandRes.error;
      const brand = brandRes.data;
      if (!brand) throw new Error("No se pudo cargar la marca emisora.");

      const sortedItems = order.items.slice().sort((a, b) => a.sort_order - b.sort_order);
      const items: InvoiceItemSnapshot[] = sortedItems.map((it) => ({
        description: it.description,
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
        line_total: Number(it.line_total),
      }));
      const total = Number(order.total);
      const paymentsSum = (paymentsRes.data ?? []).reduce((s, p: any) => s + Number(p.amount), 0);
      const advance = Number(order.advance_amount || 0) + paymentsSum;
      const balance = Math.max(0, total - advance);
      const nextVersionNumber = (latestVersionRes.data?.version_number ?? 0) + 1;

      const data: InvoiceDocumentData = {
        invoice_number: order.invoice_number,
        order_number: order.order_number,
        issued_at: new Date().toISOString(),
        sale_date: order.sale_date,
        payment_method: order.payment_method,
        seller_name: userRes.data.user?.email ?? null,
        notes: order.notes,
        version_number: nextVersionNumber,
        brand: {
          name: brand.name, slug: (brand as any).slug ?? null,
          legal_name: brand.legal_name, tax_id: brand.tax_id,
          address: (brand as any).address ?? null, city: (brand as any).city ?? null,
          phone: (brand as any).phone ?? null, email: (brand as any).email ?? null,
          website: (brand as any).website ?? null, logo_url: brand.logo_url,
          primary_color: brand.primary_color,
          invoice_footer_note: (brand as any).invoice_footer_note ?? null,
        },
        customer: {
          name: order.customer_name, company: order.customer_company,
          doc_type: order.customer_doc_type, doc_number: order.customer_doc_number,
          phone: order.customer_phone, email: order.customer_email,
          address: order.customer_address, city: order.customer_city,
          department: order.customer_department,
        },
        items,
        subtotal: Number(order.subtotal), discount: Number(order.discount),
        tax: Number(order.tax), total, advance, balance,
      };

      const [{ pdf }, { InvoiceDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./invoice-document"),
      ]);
      const blob = await pdf(<InvoiceDocument data={data} />).toBlob();

      const ts = Date.now();
      const path = `${order.brand_id}/${order.id}-${order.invoice_number}-v${nextVersionNumber}-${ts}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("invoices")
        .upload(path, blob, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;

      const userEmail = userRes.data.user?.email ?? null;
      const userId = userRes.data.user?.id ?? null;
      const invoicePayload = {
        order_id: order.id,
        brand_id: order.brand_id,
        invoice_number: order.invoice_number,
        terms_version_id: null,
        terms_snapshot_html: null,
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
        items_snapshot: items,
        issued_at: new Date().toISOString(),
      };

      let invoiceId: string;
      if (existingRes.data) {
        const { error: updErr } = await supabase
          .from("invoices").update(invoicePayload).eq("id", existingRes.data.id);
        if (updErr) throw updErr;
        invoiceId = existingRes.data.id;
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from("invoices").insert(invoicePayload).select("id").single();
        if (insErr) throw insErr;
        invoiceId = inserted.id;
      }

      // Insert version row
      const change_summary = diffSummary(latestVersionRes.data as VersionRow | null, {
        subtotal: Number(order.subtotal), discount: Number(order.discount),
        tax: Number(order.tax), total, advance, items,
      });
      const { error: vErr } = await supabase.from("invoice_versions").insert({
        invoice_id: invoiceId,
        order_id: order.id,
        brand_id: order.brand_id,
        version_number: nextVersionNumber,
        invoice_number: order.invoice_number,
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
        items_snapshot: items,
        change_summary,
      });
      if (vErr) throw vErr;

      // Hito de "Cuenta de cobro" en las órdenes de producción ligadas:
      // se guarda en la PRIMERA emisión y no se sobrescribe en regeneraciones.
      const isFirstIssue = !existingRes.data;
      if (isFirstIssue) {
        const today = new Date().toISOString().slice(0, 10);
        await supabase
          .from("production_orders")
          .update({ invoice_date: today } as any)
          .eq("order_id", order.id)
          .is("invoice_date", null);
      }

      const { data: signed } = await supabase.storage.from("invoices").createSignedUrl(path, 60 * 10);
      if (signed?.signedUrl) window.open(signed.signedUrl, "_blank", "noopener");

      return { regenerated: !!existingRes.data, version: nextVersionNumber };
    },
    onSuccess: ({ regenerated, version }) => {
      toast.success(regenerated ? `Cuenta de cobro regenerada (v${version})` : "Cuenta de cobro emitida");
      qc.invalidateQueries({ queryKey: ["invoice", order.id] });
      qc.invalidateQueries({ queryKey: ["invoice-versions"] });
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

  const sendInvoiceFn = useServerFn(sendInvoiceEmail);
  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!invoiceQuery.data?.id) throw new Error("No hay cuenta de cobro emitida.");
      if (!order.customer_email) throw new Error("El cliente no tiene correo registrado.");
      return await sendInvoiceFn({ data: { invoice_id: invoiceQuery.data.id, to: order.customer_email } });
    },
    onSuccess: () => {
      toast.success(`Cuenta de cobro enviada a ${order.customer_email}`);
      qc.invalidateQueries({ queryKey: ["invoice", order.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const issued = invoiceQuery.data;
  const versions = versionsQuery.data || [];

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">Cuentas de cobro</p>
      </div>

      {invoiceQuery.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : issued ? (
        <div className="space-y-3 text-sm">
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Cuenta de cobro vigente</p>
            <p className="font-semibold text-base">{issued.invoice_number}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Última emisión {new Date(issued.issued_at).toLocaleString("es-CO")}
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
            <Download className="h-4 w-4" /> Descargar versión actual
          </Button>

          <Button
            size="sm" className="w-full gap-2"
            onClick={() => issueMutation.mutate()}
            disabled={issueMutation.isPending || !order.invoice_number}
          >
            {issueMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Generando nueva versión…</>
            ) : (
              <><RefreshCw className="h-4 w-4" /> Generar nueva versión</>
            )}
          </Button>

          {/* Version history */}
          {versions.length > 0 && (
            <div className="pt-3 border-t border-border">
              <div className="flex items-center gap-1.5 mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                <History className="h-3 w-3" />
                Historial de versiones ({versions.length})
              </div>
              <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {versions.map((v, idx) => {
                  const isCurrent = idx === 0;
                  return (
                    <li
                      key={v.id}
                      className={`rounded-md border px-2.5 py-2 text-xs ${
                        isCurrent ? "border-primary/40 bg-primary/5" : "border-border bg-background"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-medium">
                          <span className={isCurrent ? "text-primary" : ""}>v{v.version_number}</span>
                          {isCurrent && (
                            <span className="text-[9px] uppercase tracking-wider bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                              Actual
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => downloadMutation.mutate(v.pdf_path)}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <Download className="h-3 w-3" /> PDF
                        </button>
                      </div>
                      <div className="mt-1 text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(v.created_at).toLocaleString("es-CO", {
                          dateStyle: "short", timeStyle: "short",
                        })}
                        {v.issued_by_email ? ` · ${v.issued_by_email}` : ""}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="tabular-nums font-medium">{formatMoney(v.total_snapshot)}</span>
                        <span className="text-muted-foreground tabular-nums text-[10px]">
                          {(v.items_snapshot?.length ?? 0)} ítems
                        </span>
                      </div>
                      {v.change_summary && (
                        <p className="mt-1 text-[11px] text-foreground/80 leading-snug">
                          {v.change_summary}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <Button
            variant="outline" size="sm" className="w-full gap-2"
            onClick={() => sendMutation.mutate()}
            disabled={sendMutation.isPending || !order.customer_email}
            title={!order.customer_email ? "El cliente no tiene correo registrado" : undefined}
          >
            {sendMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</>
            ) : (
              <><Mail className="h-4 w-4" /> {issued.sent_at ? "Reenviar al cliente" : "Enviar al cliente"}</>
            )}
          </Button>
          {issued.sent_at && (
            <p className="text-[11px] text-muted-foreground text-center">
              Último envío {new Date(issued.sent_at).toLocaleString("es-CO")} · {issued.send_count} envío{issued.send_count === 1 ? "" : "s"}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {!order.invoice_number && (
            <div className="flex gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Asigna un número de cuenta de cobro a esta venta antes de emitir.</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Genera el PDF de cuenta de cobro con el detalle actual. Cada regeneración queda guardada como una nueva versión descargable.
          </p>
          <Button
            size="sm" className="w-full gap-2"
            onClick={() => issueMutation.mutate()}
            disabled={issueMutation.isPending || !order.invoice_number}
          >
            {issueMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Emitiendo…</>
            ) : (
              <><FileText className="h-4 w-4" /> Emitir cuenta de cobro</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
