import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, Search, ArrowUpRight, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StageBadge } from "@/features/real-production/stage-badge";
import { LOGISTICA_STAGES, STAGES } from "@/features/real-production/meta";

export const Route = createFileRoute("/_authenticated/erp/real-production/logistica")({
  component: LogisticaDashboard,
});

function LogisticaDashboard() {
  const { selectedBrandId } = useBrand();
  const [stage, setStage] = useState<string>("all");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["real-production-list", selectedBrandId, "logistica", stage],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      let query = supabase
        .from("real_production_orders")
        .select(`
          id, code, stage, qc_ok, delivery_target, completed_at, delivered_at, created_at,
          order:orders!order_id(id, order_number, customer_name, customer_city)
        `)
        .eq("brand_id", selectedBrandId!)
        .in("stage", LOGISTICA_STAGES as unknown as string[])
        .order("completed_at", { ascending: false, nullsFirst: false });
      if (stage !== "all") query = query.eq("stage", stage);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return q.data ?? [];
    return (q.data ?? []).filter((r: any) =>
      r.code?.toLowerCase().includes(t) ||
      r.order?.order_number?.toLowerCase().includes(t) ||
      r.order?.customer_name?.toLowerCase().includes(t),
    );
  }, [q.data, search]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar código, cliente…" className="pl-9" />
        </div>
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las etapas</SelectItem>
            {STAGES.filter((s) => LOGISTICA_STAGES.includes(s.value)).map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {q.isLoading ? (
        <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Truck className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">Sin órdenes en logística</p>
          <p className="text-xs text-muted-foreground mt-1">Las órdenes aparecen aquí cuando producción las marca como terminadas.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r: any) => (
            <Link key={r.id} to="/erp/real-production/$id" params={{ id: r.id }}
              className="block rounded-xl border border-border bg-surface p-4 hover:border-primary/50 transition-colors">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-mono text-sm font-semibold">{r.code}</p>
                    <StageBadge stage={r.stage} />
                    {r.qc_ok && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-medium">QC OK</span>}
                    {r.delivery_target && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 font-medium capitalize">→ {r.delivery_target}</span>}
                  </div>
                  <p className="text-sm mt-1 truncate">
                    {r.order?.customer_name ?? "—"}
                    {r.order?.order_number && <span className="text-muted-foreground"> · venta {r.order.order_number}</span>}
                    {r.order?.customer_city && <span className="text-muted-foreground"> · {r.order.customer_city}</span>}
                  </p>
                  {r.completed_at && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Terminado: {new Date(r.completed_at).toLocaleString("es-CO")}
                      {r.delivered_at && <> · Entregado: {new Date(r.delivered_at).toLocaleString("es-CO")}</>}
                    </p>
                  )}
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
