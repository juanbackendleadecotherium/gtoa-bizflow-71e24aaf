import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, Search, ArrowUpRight, Factory } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StageBadge } from "@/features/real-production/stage-badge";
import { PRODUCTION_STAGES, STAGES } from "@/features/real-production/meta";
import { formatMoney } from "@/features/real-production/margin-indicator";

export const Route = createFileRoute("/_authenticated/erp/real-production/produccion")({
  component: ProduccionDashboard,
});

function ProduccionDashboard() {
  const { selectedBrandId } = useBrand();
  const [stage, setStage] = useState<string>("all");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["real-production-list", selectedBrandId, "produccion", stage],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      let query = supabase
        .from("real_production_orders")
        .select(`
          id, code, stage, supplier_cost, sale_total_snapshot, margin_pct, supplier_approved, created_at,
          supplier:suppliers!supplier_id(name, category),
          order:orders!order_id(id, order_number, customer_name, total)
        `)
        .eq("brand_id", selectedBrandId!)
        .in("stage", PRODUCTION_STAGES as unknown as string[])
        .order("created_at", { ascending: false });
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
      r.order?.customer_name?.toLowerCase().includes(t) ||
      r.supplier?.name?.toLowerCase().includes(t),
    );
  }, [q.data, search]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar código, cliente, proveedor…" className="pl-9" />
        </div>
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las etapas</SelectItem>
            {STAGES.filter((s) => PRODUCTION_STAGES.includes(s.value)).map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {q.isLoading ? (
        <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Factory className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">Sin órdenes en producción</p>
          <p className="text-xs text-muted-foreground mt-1">Crea una desde el detalle de una venta.</p>
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
                    {r.supplier_approved && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-medium">Proveedor OK</span>}
                  </div>
                  <p className="text-sm mt-1 truncate">
                    {r.order?.customer_name ?? "—"}
                    {r.order?.order_number && <span className="text-muted-foreground"> · venta {r.order.order_number}</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {r.supplier?.name && <>Proveedor: <span className="text-foreground">{r.supplier.name}</span> · </>}
                    Venta {formatMoney(r.sale_total_snapshot)}
                    {r.supplier_cost != null && <> · Costo {formatMoney(r.supplier_cost)}</>}
                    {r.margin_pct != null && <> · Margen <span className={r.supplier_approved ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}>{Number(r.margin_pct).toFixed(1)}%</span></>}
                  </p>
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
