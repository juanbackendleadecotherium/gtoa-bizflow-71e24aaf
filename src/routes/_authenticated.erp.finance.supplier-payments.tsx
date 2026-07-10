import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Wallet, Loader2, Search, DollarSign, ExternalLink, ShieldAlert } from "lucide-react";
import {
  listPendingSupplierPayments,
  type PendingSupplierPayment,
} from "@/lib/supplier-advance-payments.functions";
import { useBrand } from "@/features/brands/brand-context";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SupplierAdvancePaymentForm } from "@/features/production/supplier-advance-payment-form";

export const Route = createFileRoute("/_authenticated/erp/finance/supplier-payments")({
  head: () => ({ meta: [{ title: "Pagos a proveedores — Grupo Getova" }] }),
  component: SupplierPaymentsPage,
});

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s.length === 10 ? s + "T00:00:00" : s);
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

function SupplierPaymentsPage() {
  const { isAdmin, roles } = useBrand();
  const isFinance = isAdmin || roles.includes("finanzas");

  if (!isFinance) {
    return <AccessDenied />;
  }
  return <SupplierPaymentsInner />;
}

function AccessDenied() {
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-6 flex items-start gap-3">
      <ShieldAlert className="h-5 w-5 text-amber-600 mt-0.5" />
      <div>
        <h2 className="font-semibold text-sm">Acceso restringido</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Esta vista es exclusiva del rol Finanzas.
        </p>
      </div>
    </div>
  );
}

function SupplierPaymentsInner() {

  const listFn = useServerFn(listPendingSupplierPayments);
  const q = useQuery({
    queryKey: ["finance-pending-supplier-payments"],
    queryFn: () => listFn(),
    refetchOnWindowFocus: true,
  });
  const qc = useQueryClient();

  const rows = (q.data ?? []) as PendingSupplierPayment[];

  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [active, setActive] = useState<PendingSupplierPayment | null>(null);

  const brands = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => { if (r.brand_id) map.set(r.brand_id, r.brand_name ?? "—"); });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [rows]);

  const suppliers = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => { if (r.supplier_id) map.set(r.supplier_id, r.supplier_name); });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (brandFilter !== "all" && r.brand_id !== brandFilter) return false;
      if (supplierFilter !== "all" && r.supplier_id !== supplierFilter) return false;
      if (term) {
        const hay = (
          r.product +
          " " +
          (r.invoice_number ?? "") +
          " " +
          (r.order_number ?? "") +
          " " +
          r.supplier_name
        ).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, brandFilter, supplierFilter, search]);

  const totalPending = filtered.reduce((acc, r) => acc + r.suggested_amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" /> Pagos a proveedores
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bandeja del gerente financiero. Cotizaciones aprobadas por producción,
            pendientes de pago para que el proveedor inicie la fabricación.
          </p>
        </div>
      </div>

      {/* Summary card */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 to-emerald-500/0 p-5">
          <p className="text-[11px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300 font-semibold">
            Total pendiente por pagar
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">
            {fmtMoney(totalPending)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {filtered.length} {filtered.length === 1 ? "pago pendiente" : "pagos pendientes"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
            Alcance
          </p>
          <p className="mt-1 text-sm text-foreground">
            Se muestran todos los ítems con proveedor externo y cotización aprobada
            en las marcas a las que tienes acceso.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-surface p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar producto, factura o proveedor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
        </div>
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="w-[180px] h-9 text-xs"><SelectValue placeholder="Marca" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las marcas</SelectItem>
            {brands.map((b) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-[200px] h-9 text-xs"><SelectValue placeholder="Proveedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los proveedores</SelectItem>
            {suppliers.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        {q.isLoading ? (
          <div className="py-12 text-center">
            <Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <DollarSign className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">Sin pagos pendientes 🎉</p>
            <p className="text-xs text-muted-foreground mt-1">
              Cuando producción apruebe una cotización, aparecerá acá.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Producto</th>
                  <th className="text-left px-4 py-2 font-semibold">Factura</th>
                  <th className="text-left px-4 py-2 font-semibold">Proveedor</th>
                  <th className="text-left px-4 py-2 font-semibold">Marca</th>
                  <th className="text-right px-4 py-2 font-semibold">Valor a pagar</th>
                  <th className="text-left px-4 py-2 font-semibold">Fecha cotización</th>
                  <th className="text-right px-4 py-2 font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.phase_id ?? r.order_item_id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-4 py-2.5 max-w-[260px]">
                      <p className="font-medium truncate">{r.product}</p>
                      {r.phase_name && (
                        <span className="inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold uppercase tracking-wide">
                          Fase · {r.phase_name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        to="/erp/orders/$id"
                        params={{ id: r.order_id }}
                        className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
                      >
                        {r.invoice_number ? `#${r.invoice_number}` : r.order_number ?? "—"}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-xs">{r.supplier_name}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        {r.brand_color && (
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: r.brand_color }}
                          />
                        )}
                        {r.brand_name ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="font-bold tabular-nums">{fmtMoney(r.suggested_amount)}</div>
                      <div className="text-[10px] text-muted-foreground">
                        Anticipo {Math.round(r.advance_pct)}% de {fmtMoney(r.cost)}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs">{fmtDate(r.quotation_date)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button size="sm" className="h-8 gap-1" onClick={() => setActive(r)}>
                        <DollarSign className="h-3.5 w-3.5" /> Registrar pago
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!active} onOpenChange={(v) => { if (!v) setActive(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">
              Registrar pago a proveedor
            </DialogTitle>
          </DialogHeader>
          {active && (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 p-3 text-xs space-y-1">
                <p><span className="text-muted-foreground">Producto:</span> <strong>{active.product}</strong></p>
                <p><span className="text-muted-foreground">Factura:</span> {active.invoice_number ? `#${active.invoice_number}` : active.order_number ?? "—"}</p>
                <p><span className="text-muted-foreground">Proveedor:</span> {active.supplier_name}</p>
                <p><span className="text-muted-foreground">Costo total:</span> {fmtMoney(active.cost)}</p>
              </div>
              <SupplierAdvancePaymentForm
                orderItemId={active.order_item_id}
                brandId={active.brand_id}
                orderId={active.order_id}
                suggestedAmount={active.cost}
                pct={active.advance_pct}
                onConfirmed={() => {
                  setActive(null);
                  qc.invalidateQueries({ queryKey: ["finance-pending-supplier-payments"] });
                  qc.invalidateQueries({ queryKey: ["finance-pending-supplier-payments-count"] });
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="text-[11px] text-muted-foreground italic">
        Recuerda: una vez registrado el pago, la fecha registrada es la fecha oficial
        de inicio de fabricación y producción recibe una notificación automática.
        No hay reversión desde la interfaz.
      </div>
    </div>
  );
}
