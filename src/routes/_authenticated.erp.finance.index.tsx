import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { TrendingUp, Wallet, Receipt, AlertCircle, Loader2 } from "lucide-react";
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

  // Recaudado por cuenta bancaria (mes seleccionado)
  const accountsQuery = useQuery({
    queryKey: ["finance-accounts", selectedBrandId, monthOffset],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const [payRes, advRes] = await Promise.all([
        supabase
          .from("order_payments")
          .select("amount, deposit_account, paid_at")
          .eq("brand_id", selectedBrandId!)
          .gte("paid_at", monthStart.toISOString().slice(0, 10))
          .lt("paid_at", monthEnd.toISOString().slice(0, 10)),
        supabase
          .from("orders")
          .select("advance_amount, advance_deposit_account, created_at")
          .eq("brand_id", selectedBrandId!)
          .gt("advance_amount", 0)
          .gte("created_at", monthStart.toISOString())
          .lt("created_at", monthEnd.toISOString()),
      ]);
      if (payRes.error) throw payRes.error;
      if (advRes.error) throw advRes.error;
      const acc = new Map<string, number>();
      for (const p of payRes.data ?? []) {
        const k = (p as any).deposit_account || "__sin_asignar__";
        acc.set(k, (acc.get(k) ?? 0) + Number((p as any).amount));
      }
      for (const o of advRes.data ?? []) {
        const k = (o as any).advance_deposit_account || "__sin_asignar__";
        acc.set(k, (acc.get(k) ?? 0) + Number((o as any).advance_amount));
      }
      return Array.from(acc.entries())
        .map(([account, total]) => ({ account, total }))
        .sort((a, b) => b.total - a.total);
    },
  });

  const monthRows = q.data ?? [];
  const totalVendido = monthRows.reduce((s, r) => s + Number(r.total), 0);
  const totalRecaudado = monthRows.reduce((s, r) => s + Number(r.paid_total), 0);
  const ventasCount = monthRows.length;
  const facturadas = monthRows.filter((r) => r.invoice_number).length;

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
        <Kpi icon={Receipt} label="Facturadas" value={`${facturadas} / ${ventasCount}`} sub="Con factura emitida" accent="text-violet-600 dark:text-violet-400" />
        <Kpi icon={AlertCircle} label="Cartera total" value={formatMoney(carteraTotal)} sub={`${carteraCount} con saldo`} accent="text-amber-600 dark:text-amber-400" />
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="text-sm font-medium mb-1">Recaudado por cuenta</p>
        <p className="text-xs text-muted-foreground mb-3">Suma de abonos iniciales y pagos del mes seleccionado.</p>
        {(accountsQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin movimientos registrados este mes.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(accountsQuery.data ?? []).map((r) => {
              const totalAccounts = (accountsQuery.data ?? []).reduce((s, x) => s + x.total, 0);
              const pct = totalAccounts > 0 ? Math.round((r.total / totalAccounts) * 100) : 0;
              const isUnassigned = r.account === "__sin_asignar__";
              return (
                <li key={r.account} className="flex items-center justify-between py-2 text-sm">
                  <span className={isUnassigned ? "text-amber-700 dark:text-amber-400" : ""}>
                    {isUnassigned ? "⚠ Sin cuenta asignada" : formatDepositAccount(r.account)}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-[11px] text-muted-foreground tabular-nums">{pct}%</span>
                    <span className="tabular-nums font-medium">{formatMoney(r.total)}</span>
                  </span>
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
                  <tr key={r.order_id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 font-medium">{r.invoice_number ?? r.order_number}</td>
                    <td className="py-2 pr-3">{r.customer_name ?? "—"}</td>
                    <td className="py-2 pr-3 text-muted-foreground text-xs">{r.seller_label}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(r.total)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatMoney(r.paid_total)}</td>
                    <td className={`py-2 text-right tabular-nums font-medium ${Number(r.balance) > 0 ? "text-amber-700 dark:text-amber-400" : ""}`}>{formatMoney(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
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
