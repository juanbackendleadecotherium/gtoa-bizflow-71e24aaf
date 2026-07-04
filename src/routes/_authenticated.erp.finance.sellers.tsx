import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, Trophy, Medal, Award, Target, TrendingUp, Wallet, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { formatMoney } from "@/features/orders/order-items-editor";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/erp/finance/sellers")({
  component: SellersPerformance,
});

type FinRow = {
  seller_id: string | null;
  seller_label: string;
  created_by: string | null;
  total: number;
  paid_total: number;
  balance: number;
  created_at: string;
};

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 1); }

function SellersPerformance() {
  const { selectedBrandId } = useBrand();
  const [monthOffset, setMonthOffset] = useState(0);

  const now = new Date();
  const refMonth = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
  const monthStart = startOfMonth(refMonth);
  const monthEnd = endOfMonth(refMonth);
  const periodIso = monthStart.toISOString().slice(0, 10);

  const salesQ = useQuery({
    queryKey: ["finance-sellers", selectedBrandId, monthOffset],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_financials")
        .select("seller_id, seller_label, created_by, total, paid_total, balance, created_at")
        .eq("brand_id", selectedBrandId!)
        .gte("created_at", monthStart.toISOString())
        .lt("created_at", monthEnd.toISOString());
      if (error) throw error;
      return (data ?? []) as FinRow[];
    },
  });

  const goalsQ = useQuery({
    queryKey: ["finance-sellers-goals", selectedBrandId, periodIso],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_goals")
        .select("seller_id, amount")
        .eq("brand_id", selectedBrandId!)
        .eq("period_month", periodIso);
      if (error) throw error;
      return data ?? [];
    },
  });

  const tiersQ = useQuery({
    queryKey: ["commission-tiers-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commission_tiers")
        .select("brand_id, min_amount, max_amount, percentage")
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const brandGoal = useMemo(() => {
    const g = (goalsQ.data ?? []).find((x: any) => x.seller_id === null);
    return g ? Number(g.amount) : 0;
  }, [goalsQ.data]);
  const goalBySeller = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of (goalsQ.data ?? []) as any[]) {
      if (g.seller_id) m.set(g.seller_id, Number(g.amount));
    }
    return m;
  }, [goalsQ.data]);

  const commissionFor = (brand: string | null, amount: number) => {
    const rows = (tiersQ.data ?? []) as any[];
    const applicable = rows
      .filter((t) => (t.brand_id === brand || t.brand_id === null))
      .filter((t) => amount >= Number(t.min_amount) && (t.max_amount == null || amount <= Number(t.max_amount)))
      .sort((a, b) => (a.brand_id === null ? 1 : -1) || Number(b.min_amount) - Number(a.min_amount));
    const pct = applicable[0]?.percentage ? Number(applicable[0].percentage) : 0;
    return { pct, amount: Math.round((amount * pct) / 100) };
  };

  const ranking = useMemo(() => {
    const map = new Map<string, { key: string; sellerId: string | null; label: string; sales: number; total: number; paid: number; balance: number }>();
    for (const r of salesQ.data ?? []) {
      const key = r.seller_id ?? r.created_by ?? `__${r.seller_label}`;
      const cur = map.get(key) ?? { key, sellerId: r.seller_id, label: r.seller_label, sales: 0, total: 0, paid: 0, balance: 0 };
      cur.sales += 1;
      cur.total += Number(r.total);
      cur.paid += Number(r.paid_total);
      cur.balance += Number(r.balance);
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [salesQ.data]);

  const totalSales = ranking.reduce((s, r) => s + r.total, 0);
  const totalPaid = ranking.reduce((s, r) => s + r.paid, 0);
  const totalBalance = ranking.reduce((s, r) => s + r.balance, 0);
  const brandPct = brandGoal > 0 ? Math.min(100, Math.round((totalSales / brandGoal) * 100)) : 0;

  const monthOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push({ value: String(i), label: d.toLocaleDateString("es-CO", { month: "long", year: "numeric" }) });
    }
    return opts;
  }, [now]);

  if (salesQ.isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  const monthLabel = refMonth.toLocaleDateString("es-CO", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold capitalize">Rendimiento · {monthLabel}</h2>
          <p className="text-xs text-muted-foreground">Vista consolidada del equipo comercial de la marca activa.</p>
        </div>
        <Select value={String(monthOffset)} onValueChange={(v) => setMonthOffset(Number(v))}>
          <SelectTrigger className="w-56 capitalize"><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthOptions.map((o) => <SelectItem key={o.value} value={o.value} className="capitalize">{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={TrendingUp} label="Ventas totales" value={formatMoney(totalSales)} tone="primary" />
        <Kpi
          icon={Target}
          label="Meta de marca"
          value={brandGoal > 0 ? formatMoney(brandGoal) : "Sin meta"}
          sub={brandGoal > 0 ? `${brandPct}% cumplido` : "Configúrala en Metas de ventas"}
          progress={brandGoal > 0 ? brandPct : undefined}
          tone="emerald"
        />
        <Kpi icon={Wallet} label="Recaudado / saldo" value={formatMoney(totalPaid)} sub={`Saldo: ${formatMoney(totalBalance)}`} tone="amber" />
        <Kpi icon={Users} label="Vendedores activos" value={String(ranking.length)} sub={`${ranking.reduce((s, r) => s + r.sales, 0)} ventas`} tone="slate" />
      </div>

      {ranking.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
          Sin ventas en este mes.
        </div>
      ) : (
        <>
          {/* Top 3 podium */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {ranking.slice(0, 3).map((r, idx) => {
              const goal = r.sellerId ? (goalBySeller.get(r.sellerId) ?? 0) : 0;
              const goalPct = goal > 0 ? Math.min(100, Math.round((r.total / goal) * 100)) : null;
              const Icon = idx === 0 ? Trophy : idx === 1 ? Medal : Award;
              const iconColor = idx === 0 ? "text-amber-500" : idx === 1 ? "text-slate-400" : "text-orange-600";
              const bgAccent = idx === 0
                ? "from-amber-500/10 to-transparent border-amber-500/40"
                : idx === 1
                  ? "from-slate-400/10 to-transparent border-slate-400/40"
                  : "from-orange-600/10 to-transparent border-orange-600/40";
              return (
                <div key={r.key} className={`rounded-xl border p-4 bg-gradient-to-b ${bgAccent}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`h-5 w-5 ${iconColor}`} />
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                      #{idx + 1} {idx === 0 ? "Top vendedor" : idx === 1 ? "Segundo lugar" : "Tercer lugar"}
                    </span>
                  </div>
                  <p className="font-medium truncate">{r.label}</p>
                  <p className="font-display text-2xl font-semibold tabular-nums mt-1">{formatMoney(r.total)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.sales} ventas</p>
                  {goalPct !== null && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                        <span>Meta {formatMoney(goal)}</span>
                        <span className={`font-medium ${goalPct >= 100 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>{goalPct}%</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${goalPct >= 100 ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${goalPct}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Full table */}
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-medium">Ranking completo</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/30">
                    <th className="px-3 py-2 w-8">#</th>
                    <th className="px-3 py-2">Vendedor</th>
                    <th className="px-3 py-2 text-right">Ventas</th>
                    <th className="px-3 py-2 text-right">Vendido</th>
                    <th className="px-3 py-2 text-right">Meta</th>
                    <th className="px-3 py-2">Progreso</th>
                    <th className="px-3 py-2 text-right">Recaudado</th>
                    <th className="px-3 py-2 text-right">Saldo</th>
                    <th className="px-3 py-2 text-right">Comisión est.</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r, idx) => {
                    const goal = r.sellerId ? (goalBySeller.get(r.sellerId) ?? 0) : 0;
                    const goalPct = goal > 0 ? Math.min(100, Math.round((r.total / goal) * 100)) : null;
                    const comm = commissionFor(selectedBrandId, r.total);
                    const recPct = r.total > 0 ? Math.round((r.paid / r.total) * 100) : 0;
                    return (
                      <tr key={r.key} className="border-t border-border hover:bg-muted/20">
                        <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-2 font-medium">{r.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.sales}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMoney(r.total)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{goal > 0 ? formatMoney(goal) : "—"}</td>
                        <td className="px-3 py-2 min-w-[140px]">
                          {goalPct === null ? (
                            <span className="text-xs text-muted-foreground">Sin meta</span>
                          ) : (
                            <div>
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className={`h-full ${goalPct >= 100 ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${goalPct}%` }} />
                              </div>
                              <p className={`text-[11px] mt-0.5 ${goalPct >= 100 ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-muted-foreground"}`}>{goalPct}%</p>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                          {formatMoney(r.paid)}
                          <span className="text-[10px] text-muted-foreground ml-1">({recPct}%)</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">{formatMoney(r.balance)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(comm.amount)}
                          <span className="text-[10px] text-muted-foreground ml-1">({comm.pct}%)</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, sub, progress, tone,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  progress?: number;
  tone: "primary" | "emerald" | "amber" | "slate";
}) {
  const toneCls = tone === "primary" ? "text-primary bg-primary/10"
    : tone === "emerald" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
    : tone === "amber" ? "text-amber-600 dark:text-amber-400 bg-amber-500/10"
    : "text-slate-600 dark:text-slate-300 bg-slate-500/10";
  const barCls = tone === "emerald" ? "bg-emerald-500" : "bg-primary";
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-8 w-8 rounded-md grid place-items-center ${toneCls}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      </div>
      <p className="font-display text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      {progress !== undefined && (
        <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className={`h-full ${barCls}`} style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
      )}
    </div>
  );
}
