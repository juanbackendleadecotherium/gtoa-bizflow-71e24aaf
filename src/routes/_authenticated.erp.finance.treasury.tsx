import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Loader2, Search, FileText, Send, CheckCircle2, XCircle, ExternalLink, DollarSign, RotateCcw, Scale } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useBrand } from "@/features/brands/brand-context";
import { formatMoney } from "@/features/orders/order-items-editor";
import {
  listTreasuryInvoices,
  getTreasuryInvoice,
  markInvoiceElectronic,
  revertInvoiceElectronic,
  getTreasuryReconciliation,
  type TreasuryInvoiceRow,
  type ReconciliationSummary,
} from "@/lib/treasury.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { PaymentDialog } from "@/features/finance/payment-dialog";
import { formatDepositAccount } from "@/features/finance/deposit-accounts";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/erp/finance/treasury")({
  head: () => ({ meta: [{ title: "Tesorería — Grupo Getova" }] }),
  component: TreasuryPage,
});

function TreasuryPage() {
  const { isAdmin, roles, brands } = useBrand();
  const isFinance = isAdmin || roles.includes("finanzas");
  const [mode, setMode] = useState<"invoices" | "reconciliation">("invoices");
  const [brandFilter, setBrandFilter] = useState<string>("all"); // "all" | brand.id
  const [search, setSearch] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"pendiente" | "parcial" | "pagada" | "todas">("todas");
  const [electronicStatus, setElectronicStatus] = useState<"no_facturada" | "facturada" | "todas">("todas");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const brandId = brandFilter === "all" ? null : brandFilter;

  const listFn = useServerFn(listTreasuryInvoices);
  const q = useQuery({
    queryKey: ["treasury-invoices", brandId, paymentStatus, electronicStatus, from, to],
    queryFn: () =>
      listFn({
        data: {
          brandId,
          paymentStatus,
          electronicStatus,
          from: from || undefined,
          to: to || undefined,
        },
      }),
    enabled: isFinance && mode === "invoices",
  });

  const rows = useMemo(() => {
    const all = q.data ?? [];
    if (!search.trim()) return all;
    const s = search.trim().toLowerCase();
    return all.filter(
      (r) =>
        (r.invoice_number ?? "").toLowerCase().includes(s) ||
        (r.order_number ?? "").toLowerCase().includes(s) ||
        (r.customer_name ?? "").toLowerCase().includes(s) ||
        (r.customer_doc_number ?? "").toLowerCase().includes(s) ||
        (r.customer_phone ?? "").toLowerCase().includes(s) ||
        (r.electronic_invoice_number ?? "").toLowerCase().includes(s),
    );
  }, [q.data, search]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.total += r.total;
        acc.paid += r.paid_total;
        acc.balance += r.balance;
        if (r.electronic_invoice_status === "facturada") acc.electronic += 1;
        return acc;
      },
      { total: 0, paid: 0, balance: 0, electronic: 0 },
    );
  }, [rows]);

  if (!isFinance) return <p className="text-sm text-muted-foreground">Solo administración o finanzas.</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-start">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate">Tesorería · Facturas</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Vista maestra de todas las facturas del ERP. Registro de pagos y marcación de facturación electrónica (Siigo).
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 shrink-0">
          <button
            onClick={() => setMode("invoices")}
            className={`px-3 py-1.5 text-xs rounded-md transition ${mode === "invoices" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            <FileText className="h-3.5 w-3.5 inline mr-1" /> Facturas
          </button>
          <button
            onClick={() => setMode("reconciliation")}
            className={`px-3 py-1.5 text-xs rounded-md transition ${mode === "reconciliation" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            <Scale className="h-3.5 w-3.5 inline mr-1" /> Reconciliación
          </button>
        </div>
      </div>

      {/* Brand selector (shared across both modes) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Marca:</span>
        <button
          onClick={() => setBrandFilter("all")}
          className={`text-xs px-2.5 py-1 rounded-full border transition ${brandFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
        >
          Todas
        </button>
        {brands.map((b) => (
          <button
            key={b.id}
            onClick={() => setBrandFilter(b.id)}
            className={`text-xs px-2.5 py-1 rounded-full border transition ${brandFilter === b.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {b.name}
          </button>
        ))}
      </div>

      {mode === "reconciliation" ? (
        <ReconciliationView brandId={brandId} />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Facturas" value={String(rows.length)} />
            <KPI label="Total facturado" value={formatMoney(totals.total)} />
            <KPI label="Recaudado" value={formatMoney(totals.paid)} tone="pos" />
            <KPI label="Saldo pendiente" value={formatMoney(totals.balance)} tone={totals.balance > 0 ? "warn" : "muted"} />
          </div>

          {/* Filters */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
              <div className="lg:col-span-2 relative min-w-0">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar factura, cliente, doc, teléfono, n° electrónica…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-full"
                />
              </div>
              <Select value={paymentStatus} onValueChange={(v: any) => setPaymentStatus(v)}>
                <SelectTrigger className="min-w-0"><SelectValue placeholder="Estado de pago" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todos los pagos</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="parcial">Parcial</SelectItem>
                  <SelectItem value="pagada">Pagada</SelectItem>
                </SelectContent>
              </Select>
              <Select value={electronicStatus} onValueChange={(v: any) => setElectronicStatus(v)}>
                <SelectTrigger className="min-w-0"><SelectValue placeholder="Facturación electrónica" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas (Siigo)</SelectItem>
                  <SelectItem value="no_facturada">Sin facturar</SelectItem>
                  <SelectItem value="facturada">Facturadas</SelectItem>
                </SelectContent>
              </Select>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="text-xs min-w-0" aria-label="Desde" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="text-xs min-w-0" aria-label="Hasta" />
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            {q.isLoading ? (
              <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : rows.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">Sin facturas para los filtros seleccionados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Factura</th>
                      <th className="px-3 py-2 font-medium">Cliente</th>
                      <th className="px-3 py-2 font-medium">Marca</th>
                      <th className="px-3 py-2 font-medium">Vendedor</th>
                      <th className="px-3 py-2 font-medium">Emisión</th>
                      <th className="px-3 py-2 font-medium text-right">Total</th>
                      <th className="px-3 py-2 font-medium text-right">Recaudado</th>
                      <th className="px-3 py-2 font-medium text-right">Saldo</th>
                      <th className="px-3 py-2 font-medium">Pago</th>
                      <th className="px-3 py-2 font-medium">Siigo</th>
                      <th className="px-3 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium">
                          {r.invoice_number ?? r.order_number ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          <div>{r.customer_name ?? "—"}</div>
                          {r.customer_doc_number && (
                            <div className="text-[10px] text-muted-foreground">{r.customer_doc_number}</div>
                          )}
                        </td>
                        <td className="px-3 py-2">{r.brand_name ?? "—"}</td>
                        <td className="px-3 py-2">{r.seller_label ?? "—"}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {new Date(r.issued_at).toLocaleDateString("es-CO")}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(r.total)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                          {formatMoney(r.paid_total)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMoney(r.balance)}</td>
                        <td className="px-3 py-2"><PaymentBadge s={r.payment_status} /></td>
                        <td className="px-3 py-2"><ElectronicBadge s={r.electronic_invoice_status} n={r.electronic_invoice_number} /></td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant="outline" onClick={() => setSelectedId(r.id)}>Ver</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {selectedId && (
        <InvoiceDetailDialog
          invoiceId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function ReconciliationView({ brandId }: { brandId: string | null }) {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const [from, setFrom] = useState(fmt(firstOfMonth));
  const [to, setTo] = useState(fmt(today));

  const reconFn = useServerFn(getTreasuryReconciliation);
  const q = useQuery({
    queryKey: ["treasury-recon", brandId, from, to],
    queryFn: () => reconFn({ data: { brandId, from, to } }),
    enabled: !!from && !!to,
  });

  const setPreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days + 1);
    setFrom(fmt(start));
    setTo(fmt(end));
  };
  const setThisMonth = () => {
    const d = new Date();
    setFrom(fmt(new Date(d.getFullYear(), d.getMonth(), 1)));
    setTo(fmt(d));
  };
  const setLastMonth = () => {
    const d = new Date();
    const start = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const end = new Date(d.getFullYear(), d.getMonth(), 0);
    setFrom(fmt(start));
    setTo(fmt(end));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="min-w-0">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Desde</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="text-xs w-full" />
          </div>
          <div className="min-w-0">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Hasta</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="text-xs w-full" />
          </div>
          <div className="sm:col-span-2 lg:col-span-2 flex flex-wrap items-end gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setPreset(7)}>7 días</Button>
            <Button variant="outline" size="sm" onClick={() => setPreset(30)}>30 días</Button>
            <Button variant="outline" size="sm" onClick={setThisMonth}>Este mes</Button>
            <Button variant="outline" size="sm" onClick={setLastMonth}>Mes anterior</Button>
          </div>
        </div>
      </div>

      {q.isLoading || !q.data ? (
        <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <ReconContent data={q.data} />
      )}
    </div>
  );
}

function ReconContent({ data }: { data: ReconciliationSummary }) {
  const diff = data.invoices_in_range.total - data.payments_in_range.on_range_invoices;
  return (
    <div className="space-y-4">
      {/* Range KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI
          label={`Facturado (${data.invoices_in_range.count})`}
          value={formatMoney(data.invoices_in_range.total)}
        />
        <KPI
          label={`Pagos recibidos (${data.payments_in_range.count})`}
          value={formatMoney(data.payments_in_range.total)}
          tone="pos"
        />
        <KPI
          label="Saldo abierto de facturas del período"
          value={formatMoney(data.open_balance_of_range_invoices)}
          tone={data.open_balance_of_range_invoices > 0 ? "warn" : "muted"}
        />
        <KPI
          label="Facturado − Recaudado (del período)"
          value={formatMoney(diff)}
          tone={diff > 0 ? "warn" : "pos"}
        />
      </div>

      {/* Payment split */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Origen de los pagos recibidos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <ReconRow label="Aplicados a facturas del período" value={data.payments_in_range.on_range_invoices} />
          <ReconRow label="Aplicados a facturas de períodos anteriores" value={data.payments_in_range.on_prior_invoices} />
          <ReconRow label="Sin factura asociada (anticipos)" value={data.payments_in_range.unlinked} />
        </div>
      </div>

      {/* By brand */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Por marca</h3>
        </div>
        {data.by_brand.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Sin facturas emitidas en el período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Marca</th>
                  <th className="px-3 py-2 font-medium text-right">Facturas</th>
                  <th className="px-3 py-2 font-medium text-right">Facturado</th>
                  <th className="px-3 py-2 font-medium text-right">Recaudado (período)</th>
                  <th className="px-3 py-2 font-medium text-right">Saldo abierto</th>
                  <th className="px-3 py-2 font-medium text-right">% Recaudo</th>
                </tr>
              </thead>
              <tbody>
                {data.by_brand.map((b) => {
                  const pct = b.invoiced_total > 0 ? (b.collected_in_range / b.invoiced_total) * 100 : 0;
                  return (
                    <tr key={b.brand_id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{b.brand_name ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{b.invoices_count}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(b.invoiced_total)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">{formatMoney(b.collected_in_range)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMoney(b.balance_open)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ReconRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-base font-display font-semibold tabular-nums mt-1">{formatMoney(value)}</p>
    </div>
  );
}

function KPI({ label, value, tone }: { label: string; value: string; tone?: "pos" | "warn" | "muted" }) {
  const cls =
    tone === "pos" ? "text-emerald-700 dark:text-emerald-300"
    : tone === "warn" ? "text-amber-700 dark:text-amber-300"
    : "";
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-lg font-display font-semibold tabular-nums mt-1 ${cls}`}>{value}</p>
    </div>
  );
}

function PaymentBadge({ s }: { s: TreasuryInvoiceRow["payment_status"] }) {
  const map = {
    pendiente: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40",
    parcial: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
    pagada: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  } as const;
  return (
    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${map[s]}`}>{s}</span>
  );
}

function ElectronicBadge({ s, n }: { s: "no_facturada" | "facturada"; n: string | null }) {
  if (s === "facturada") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40">
        <CheckCircle2 className="h-3 w-3" /> {n ?? "OK"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-muted text-muted-foreground border-border">
      <XCircle className="h-3 w-3" /> Sin facturar
    </span>
  );
}

function InvoiceDetailDialog({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getTreasuryInvoice);
  const q = useQuery({
    queryKey: ["treasury-invoice", invoiceId],
    queryFn: () => getFn({ data: { invoiceId } }),
  });
  const [payOpen, setPayOpen] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["treasury-invoice", invoiceId] });
    qc.invalidateQueries({ queryKey: ["treasury-invoices"] });
  };

  const inv = q.data;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Factura {inv?.invoice_number ?? inv?.order_number ?? "…"}
          </DialogTitle>
        </DialogHeader>

        {q.isLoading || !inv ? (
          <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-5">
            {/* Header */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Info label="Cliente" value={inv.customer_name} />
              <Info label="Documento" value={inv.customer_doc_number} />
              <Info label="Marca" value={inv.brand_name} />
              <Info label="Vendedor" value={inv.seller_label} />
              <Info label="Emisión" value={new Date(inv.issued_at).toLocaleString("es-CO")} />
              <Info label="Orden" value={
                <Link to="/erp/orders/$id" params={{ id: inv.order_id }} className="text-primary inline-flex items-center gap-1 hover:underline">
                  {inv.order_number ?? inv.order_id} <ExternalLink className="h-3 w-3" />
                </Link>
              } />
            </div>

            {/* Totals */}
            <div className="grid grid-cols-3 gap-2">
              <KPI label="Total" value={formatMoney(inv.total)} />
              <KPI label="Recaudado" value={formatMoney(inv.paid_total)} tone="pos" />
              <KPI label="Saldo" value={formatMoney(inv.balance)} tone={inv.balance > 0 ? "warn" : "muted"} />
            </div>

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              {inv.balance > 0.01 && (
                <Button size="sm" onClick={() => setPayOpen(true)} className="gap-1">
                  <DollarSign className="h-3.5 w-3.5" /> Registrar pago
                </Button>
              )}
              {inv.electronic_invoice_status === "no_facturada" ? (
                <MarkElectronicDialog invoiceId={inv.id} onDone={invalidate} />
              ) : (
                <RevertElectronicDialog invoiceId={inv.id} onDone={invalidate} />
              )}
            </div>

            {/* Payments */}
            <section>
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Pagos registrados</h3>
              {inv.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Aún no hay pagos.</p>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40">
                      <tr className="text-left">
                        <th className="px-2 py-1.5 font-medium">Fecha</th>
                        <th className="px-2 py-1.5 font-medium text-right">Monto</th>
                        <th className="px-2 py-1.5 font-medium">Método</th>
                        <th className="px-2 py-1.5 font-medium">Cuenta</th>
                        <th className="px-2 py-1.5 font-medium">Ref</th>
                        <th className="px-2 py-1.5 font-medium">Registró</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inv.payments.map((p) => (
                        <tr key={p.id} className="border-t border-border">
                          <td className="px-2 py-1.5 tabular-nums">{new Date(p.paid_at).toLocaleDateString("es-CO")}</td>
                          <td className="px-2 py-1.5 tabular-nums text-right font-medium">{formatMoney(Number(p.amount))}</td>
                          <td className="px-2 py-1.5">{p.method ?? "—"}</td>
                          <td className="px-2 py-1.5">{p.deposit_account ? formatDepositAccount(p.deposit_account) : "—"}</td>
                          <td className="px-2 py-1.5">{p.reference ?? "—"}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{p.created_by_email ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Electronic invoice info */}
            {inv.electronic_invoice_status === "facturada" && (
              <section className="rounded-lg border border-blue-500/40 bg-blue-500/5 p-3 text-xs space-y-1">
                <p className="font-medium text-blue-800 dark:text-blue-200 inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Factura electrónica emitida (Siigo)
                </p>
                <p>N° electrónica: <span className="font-semibold">{inv.electronic_invoice_number}</span></p>
                {inv.electronic_invoice_issued_at && (
                  <p>Emitida: {new Date(inv.electronic_invoice_issued_at).toLocaleString("es-CO")}</p>
                )}
              </section>
            )}

            {/* Electronic log */}
            {inv.electronic_log.length > 0 && (
              <section>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Historial Siigo</h3>
                <ul className="space-y-1 text-xs">
                  {inv.electronic_log.map((l) => (
                    <li key={l.id} className="border-l-2 border-border pl-3">
                      <span className="font-medium">{l.action === "marked_facturada" ? "Marcada" : "Revertida"}</span>
                      {l.external_number && <> · N° {l.external_number}</>}
                      <span className="text-muted-foreground"> · {l.actor_email ?? "—"} · {new Date(l.created_at).toLocaleString("es-CO")}</span>
                      {l.note && <p className="text-muted-foreground">{l.note}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {inv && (
          <PaymentDialog
            open={payOpen}
            onOpenChange={(o) => { setPayOpen(o); if (!o) invalidate(); }}
            orderId={inv.order_id}
            brandId={inv.brand_id}
            balance={inv.balance}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm">{value ?? "—"}</p>
    </div>
  );
}

function MarkElectronicDialog({ invoiceId, onDone }: { invoiceId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [num, setNum] = useState("");
  const [issuedAt, setIssuedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [note, setNote] = useState("");
  const markFn = useServerFn(markInvoiceElectronic);
  const mut = useMutation({
    mutationFn: () => markFn({ data: { invoiceId, externalNumber: num.trim(), issuedAt: new Date(issuedAt).toISOString(), note: note.trim() || undefined } }),
    onSuccess: () => { toast.success("Marcada como facturada"); setOpen(false); setNum(""); setNote(""); onDone(); },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <Send className="h-3.5 w-3.5" /> Marcar facturada (Siigo)
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar facturación electrónica</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">N° factura electrónica (Siigo)</label>
            <Input value={num} onChange={(e) => setNum(e.target.value)} placeholder="FE-1234" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Fecha de emisión</label>
            <Input type="datetime-local" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Observación (opcional)</label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={!num.trim() || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevertElectronicDialog({ invoiceId, onDone }: { invoiceId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const revFn = useServerFn(revertInvoiceElectronic);
  const mut = useMutation({
    mutationFn: () => revFn({ data: { invoiceId, reason: reason.trim() } }),
    onSuccess: () => { toast.success("Marca revertida"); setOpen(false); setReason(""); onDone(); },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <RotateCcw className="h-3.5 w-3.5" /> Revertir Siigo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Revertir facturación electrónica</DialogTitle></DialogHeader>
        <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (mín. 5 caracteres)" />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={reason.trim().length < 5 || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
