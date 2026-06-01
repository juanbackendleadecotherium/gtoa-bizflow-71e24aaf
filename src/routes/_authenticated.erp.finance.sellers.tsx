import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, Trophy, Medal, Award } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { formatMoney } from "@/features/orders/order-items-editor";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/erp/finance/sellers")({
  component: SellersPerformance,
});

type Row = {
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

  const q = useQuery({
    queryKey: ["finance-sellers", selectedBrandId, monthOffset],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_financials")
        .select("seller_label, created_by, total, paid_total, balance, created_at")
        .eq("brand_id", selectedBrandId!)
        .gte("created_at", monthStart.toISOString())
        .lt("created_at", monthEnd.toISOString());
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const ranking = useMemo(() => {
    const map = new Map<string, { label: string; sales: number; total: number; paid: number; balance: number }>();
    for (const r of q.data ?? []) {
      const key = r.created_by ?? `__${r.seller_label}`;
      const cur = map.get(key) ?? { label: r.seller_label, sales: 0, total: 0, paid: 0, balance: 0 };
      cur.sales += 1;
      cur.total += Number(r.total);
      cur.paid += Number(r.paid_total);
      cur.balance += Number(r.balance);
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [q.data]);

  const top = ranking[0]?.total ?? 0;

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
        <h2 className="text-sm font-medium text-muted-foreground">Ranking del mes</h2>
        <Select value={String(monthOffset)} onValueChange={(v) => setMonthOffset(Number(v))}>
          <SelectTrigger className="w-56 capitalize"><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthOptions.map((o) => <SelectItem key={o.value} value={o.value} className="capitalize">{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        {ranking.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Sin ventas en este mes.</p>
        ) : (
          <ol className="space-y-3">
            {ranking.map((r, idx) => {
              const pct = top > 0 ? Math.round((r.total / top) * 100) : 0;
              const recPct = r.total > 0 ? Math.round((r.paid / r.total) * 100) : 0;
              const Icon = idx === 0 ? Trophy : idx === 1 ? Medal : idx === 2 ? Award : null;
              const iconColor = idx === 0 ? "text-amber-500" : idx === 1 ? "text-slate-400" : "text-orange-600";
              return (
                <li key={r.label + idx} className="rounded-lg border border-border bg-background p-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {Icon ? <Icon className={`h-4 w-4 ${iconColor}`} /> : <span className="text-xs text-muted-foreground w-4 text-center">{idx + 1}</span>}
                      <p className="font-medium truncate">{r.label}</p>
                    </div>
                    <p className="font-display text-lg font-semibold tabular-nums">{formatMoney(r.total)}</p>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                    <div><span className="text-foreground font-medium">{r.sales}</span> ventas</div>
                    <div>Recaudado <span className="text-emerald-700 dark:text-emerald-400 font-medium tabular-nums">{formatMoney(r.paid)}</span> ({recPct}%)</div>
                    <div className="text-right">Saldo <span className="text-amber-700 dark:text-amber-400 font-medium tabular-nums">{formatMoney(r.balance)}</span></div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
