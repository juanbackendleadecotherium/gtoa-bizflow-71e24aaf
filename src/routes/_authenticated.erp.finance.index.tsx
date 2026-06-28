import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { TrendingUp, Wallet, Receipt, AlertCircle, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { formatMoney } from "@/features/orders/order-items-editor";
import { formatDepositAccount } from "@/features/finance/deposit-accounts";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/erp/finance/")({
  component: FinanceDashboard,
});

type Row = {
  order_id: string;
  brand_id: string;
  order_number: string;
  invoice_number: string | null;
  customer_name: string | null;
  created_at: string;
  sale_date: string | null;
  total: number;
  advance_amount: number;
  payments_total: number;
  paid_total: number;
  balance: number;
  payment_status: "pagada" | "abono" | "sin_abono";
  days_since_sale: number;
  seller_label: string;
};

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 1); }

function FinanceDashboard() {
  const { selectedBrandId } = useBrand();
  const [monthOffset, setMonthOffset] = useState(0);

  const now = new Date();
  const refMonth = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
  const monthStart = startOfMonth(refMonth);
  const monthEnd = endOfMonth(refMonth);

  const q = useQuery({
    queryKey: ["finance-dashboard", selectedBrandId, monthOffset],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_financials")
        .select("order_id, brand_id, order_number, invoice_number, customer_name, created_at, sale_date, total, advance_amount, payments_total, paid_total, balance, payment_status, days_since_sale, seller_label")
        .eq("brand_id", selectedBrandId!)
        .gte("created_at", monthStart.toISOString())
        .lt("created_at", monthEnd.toISOString());
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  // Aggregate cartera (all-time, not filtered by month)
  const carteraQuery = useQuery({
    queryKey: ["finance-cartera-totals", selectedBrandId],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_financials")
        .select("balance, payment_status")
        .eq("brand_id", selectedBrandId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Recaudado por cuenta bancaria (mes seleccionado) — con desglose por cuenta de cobro
  const accountsQuery = useQuery({
    queryKey: ["finance-accounts", selectedBrandId, monthOffset],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const [payRes, advRes] = await Promise.all([
        supabase
          .from("order_payments")
          .select("amount, deposit_account, paid_at, order_id, orders:order_id(order_number, invoice_number, customer_name)")
          .eq("brand_id", selectedBrandId!)
          .gte("paid_at", monthStart.toISOString().slice(0, 10))
          .lt("paid_at", monthEnd.toISOString().slice(0, 10)),
        supabase
          .from("orders")
          .select("id, order_number, invoice_number, customer_name, advance_amount, advance_deposit_account, created_at")
          .eq("brand_id", selectedBrandId!)
          .gt("advance_amount", 0)
          .gte("created_at", monthStart.toISOString())
          .lt("created_at", monthEnd.toISOString()),
      ]);
      if (payRes.error) throw payRes.error;
      if (advRes.error) throw advRes.error;
      type Entry = { label: string; ref: string; customer: string; amount: number; kind: "abono" | "pago"; date: string };
      const acc = new Map<string, { total: number; entries: Entry[] }>();
      const push = (k: string, e: Entry) => {
        const cur = acc.get(k) ?? { total: 0, entries: [] };
        cur.total += e.amount;
        cur.entries.push(e);
        acc.set(k, cur);
      };
      for (const p of payRes.data ?? []) {
        const k = (p as any).deposit_account || "__sin_asignar__";
        const o = (p as any).orders ?? {};
        push(k, {
          label: o.invoice_number ?? o.order_number ?? "—",
          ref: o.invoice_number ? "Cuenta de cobro" : "Orden",
          customer: o.customer_name ?? "—",
          amount: Number((p as any).amount),
          kind: "pago",
          date: (p as any).paid_at,
        });
      }
      for (const o of advRes.data ?? []) {
        const k = (o as any).advance_deposit_account || "__sin_asignar__";
        push(k, {
          label: (o as any).invoice_number ?? (o as any).order_number ?? "—",
          ref: (o as any).invoice_number ? "Cuenta de cobro" : "Orden",
          customer: (o as any).customer_name ?? "—",
          amount: Number((o as any).advance_amount),
          kind: "abono",
          date: ((o as any).created_at ?? "").slice(0, 10),
        });
      }
      return Array.from(acc.entries())
        .map(([account, v]) => ({ account, total: v.total, entries: v.entries.sort((a, b) => b.amount - a.amount) }))
        .sort((a, b) => b.total - a.total);
    },
  });

  const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>({});
  const toggleAccount = (k: string) => setExpandedAccounts((s) => ({ ...s, [k]: !s[k] }));


  const monthRows = q.data ?? [];
  const totalVendido = monthRows.reduce((s, r) => s + Number(r.total), 0);
  const totalRecaudado = monthRows.reduce((s, r) => s + Number(r.paid_total), 0);
  const ventasCount = monthRows.length;
  const emitidas = monthRows.filter((r) => r.invoice_number).length;

  const carteraTotal = (carteraQuery.data ?? []).reduce((s, r: any) => s + Number(r.balance), 0);
  const carteraCount = (carteraQuery.data ?? []).filter((r: any) => Number(r.balance) > 0).length;

  const monthOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push({ value: String(i), label: d.toLocaleDateString("es-CO", { month: "long", year: "numeric" }) });
    }
    return opts;
  }, [now]);

  if (q.isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-medium text-muted-foreground">Mes seleccionado</h2>
        <Select value={String(monthOffset)} onValueChange={(v) => setMonthOffset(Number(v))}>
          <SelectTrigger className="w-56 capitalize"><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthOptions.map((o) => <SelectItem key={o.value} value={o.value} className="capitalize">{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={TrendingUp} label="Total vendido" value={formatMoney(totalVendido)} sub={`${ventasCount} venta${ventasCount === 1 ? "" : "s"}`} accent="text-emerald-600 dark:text-emerald-400" />
        <Kpi icon={Wallet} label="Recaudado" value={formatMoney(totalRecaudado)} sub={`${Math.round(totalVendido ? (totalRecaudado / totalVendido) * 100 : 0)}% del vendido`} accent="text-sky-600 dark:text-sky-400" />
        <Kpi icon={Receipt} label="Emitidas" value={`${emitidas} / ${ventasCount}`} sub="Con cuenta de cobro emitida" accent="text-violet-600 dark:text-violet-400" />
        <Kpi icon={AlertCircle} label="Cartera total" value={formatMoney(carteraTotal)} sub={`${carteraCount} con saldo`} accent="text-amber-600 dark:text-amber-400" />
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="text-sm font-medium mb-1">Recaudado por cuenta</p>
        <p className="text-xs text-muted-foreground mb-3">Suma de abonos iniciales y pagos del mes seleccionado. Haz clic en una cuenta para ver el detalle por cuenta de cobro.</p>
        {(accountsQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin movimientos registrados este mes.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(accountsQuery.data ?? []).map((r) => {
              const totalAccounts = (accountsQuery.data ?? []).reduce((s, x) => s + x.total, 0);
              const pct = totalAccounts > 0 ? Math.round((r.total / totalAccounts) * 100) : 0;
              const isUnassigned = r.account === "__sin_asignar__";
              const isOpen = !!expandedAccounts[r.account];
              return (
                <li key={r.account} className="py-2 text-sm">
                  <button
                    onClick={() => toggleAccount(r.account)}
                    className="w-full flex items-center justify-between gap-2 text-left hover:opacity-80 transition-opacity"
                  >
                    <span className={`flex items-center gap-1.5 ${isUnassigned ? "text-amber-700 dark:text-amber-400" : ""}`}>
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      {isUnassigned ? "⚠ Sin cuenta asignada" : formatDepositAccount(r.account)}
                      <span className="text-[11px] text-muted-foreground ml-1">({r.entries.length} movimiento{r.entries.length === 1 ? "" : "s"})</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-[11px] text-muted-foreground tabular-nums">{pct}%</span>
                      <span className="tabular-nums font-medium">{formatMoney(r.total)}</span>
                    </span>
                  </button>
                  {isOpen && (
                    <ul className="mt-2 ml-5 pl-3 border-l border-border space-y-1.5">
                      {r.entries.map((e, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className={`shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${e.kind === "abono" ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"}`}>
                              {e.kind === "abono" ? "Abono inicial" : "Pago"}
                            </span>
                            <span className="font-medium truncate">{e.ref} {e.label}</span>
                            <span className="text-muted-foreground truncate">· {e.customer}</span>
                          </span>
                          <span className="flex items-center gap-3 shrink-0">
                            <span className="text-[10px] text-muted-foreground tabular-nums">{e.date}</span>
                            <span className="tabular-nums">{formatMoney(e.amount)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>




      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="text-sm font-medium mb-3">Ventas del mes</p>
        {monthRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin ventas registradas este mes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 w-6"></th>
                  <th className="py-2 pr-3">Venta</th>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Vendedor</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2 pr-3 text-right">Pagado</th>
                  <th className="py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {monthRows.map((r) => (
                  <SaleRow key={r.order_id} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


function SaleRow({ row: r }: { row: Row }) {
  const [open, setOpen] = useState(false);
  const pct = Number(r.total) > 0 ? Math.min(100, Math.round((Number(r.paid_total) / Number(r.total)) * 100)) : 0;

  const detailsQ = useQuery({
    queryKey: ["finance-row-details", r.order_id],
    enabled: open,
    queryFn: async () => {
      const [pays, ord] = await Promise.all([
        supabase
          .from("order_payments")
          .select("id, amount, paid_at, method, reference, deposit_account")
          .eq("order_id", r.order_id)
          .order("paid_at", { ascending: true }),
        supabase
          .from("orders")
          .select("advance_deposit_account")
          .eq("id", r.order_id)
          .maybeSingle(),
      ]);
      if (pays.error) throw pays.error;
      if (ord.error) throw ord.error;
      return { payments: pays.data ?? [], advanceAccount: (ord.data?.advance_deposit_account as string | null) ?? null };
    },
  });

  type Abono = { kind: "abono" | "pago"; amount: number; date: string; account: string | null; method?: string | null; reference?: string | null };
  const abonos: Abono[] = [];
  if (open && detailsQ.data) {
    if (Number(r.advance_amount) > 0) {
      abonos.push({
        kind: "abono",
        amount: Number(r.advance_amount),
        date: (r.sale_date ?? r.created_at).slice(0, 10),
        account: detailsQ.data.advanceAccount,
      });
    }
    for (const p of detailsQ.data.payments) {
      abonos.push({
        kind: "pago",
        amount: Number((p as any).amount),
        date: (p as any).paid_at,
        account: (p as any).deposit_account ?? null,
        method: (p as any).method,
        reference: (p as any).reference,
      });
    }
  }

  return (
    <>
      <tr className="border-b border-border/60 last:border-0 hover:bg-muted/30">
        <td className="py-2 pr-1">
          <button onClick={() => setOpen((s) => !s)} className="text-muted-foreground hover:text-foreground" aria-label={open ? "Contraer" : "Expandir"}>
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </td>
        <td className="py-2 pr-3 font-medium">{r.invoice_number ?? r.order_number}</td>
        <td className="py-2 pr-3">{r.customer_name ?? "—"}</td>
        <td className="py-2 pr-3 text-muted-foreground text-xs">{r.seller_label}</td>
        <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(r.total)}</td>
        <td className="py-2 pr-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatMoney(r.paid_total)}</td>
        <td className={`py-2 text-right tabular-nums font-medium ${Number(r.balance) > 0 ? "text-amber-700 dark:text-amber-400" : ""}`}>{formatMoney(r.balance)}</td>
      </tr>
      {open && (
        <tr className="border-b border-border/60 bg-muted/20">
          <td></td>
          <td colSpan={6} className="py-3 pr-3">
            {detailsQ.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <ul className="space-y-2">
                {abonos.length === 0 ? (
                  <li className="text-xs text-muted-foreground">Sin abonos registrados.</li>
                ) : abonos.map((a, i) => {
                  const aPct = Number(r.total) > 0 ? Math.min(100, Math.round((a.amount / Number(r.total)) * 100)) : 0;
                  return (
                    <li key={i} className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${a.kind === "abono" ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"}`}>
                            {a.kind === "abono" ? "Abono inicial" : "Pago"}
                          </span>
                          <span className="font-medium">Cuenta de cobro {r.invoice_number ?? r.order_number}</span>
                          <span className="text-muted-foreground">· {a.date}</span>
                        </span>
                        <span className="tabular-nums font-semibold">{formatMoney(a.amount)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-muted-foreground flex-wrap">
                        <span>Cuenta: <span className="text-foreground">{a.account ? formatDepositAccount(a.account) : "—"}</span></span>
                        {a.method && <span>{a.method}{a.reference ? ` · ${a.reference}` : ""}</span>}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>Total venta: <span className="tabular-nums font-medium text-foreground">{formatMoney(r.total)}</span></span>
                        <span>Aporta: <span className="tabular-nums font-medium text-foreground">{aPct}%</span></span>
                      </div>
                    </li>
                  );
                })}
                <li className="rounded-md border border-border bg-background px-3 py-2">
                  <div className="flex items-center justify-between text-xs mb-1.5 flex-wrap gap-2">
                    <span className="font-medium">Avance total</span>
                    <span className="tabular-nums text-muted-foreground">
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">{formatMoney(r.paid_total)}</span>
                      {" / "}{formatMoney(r.total)}
                      {" · Saldo "}<span className={`font-medium ${Number(r.balance) > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}>{formatMoney(r.balance)}</span>
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full transition-all ${pct >= 100 ? "bg-emerald-500" : "bg-primary"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground text-right mt-1">{pct}% pagado</p>
                </li>
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function Kpi({
  icon: Icon, label, value, sub, accent,
}: { icon: any; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`h-4 w-4 ${accent ?? ""}`} />
        {label}
      </div>
      <p className="font-display text-xl font-semibold mt-2 tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
