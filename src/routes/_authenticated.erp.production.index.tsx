import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, Factory, Search, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductionStatusBadge } from "@/features/production/status-badge";
import { PRODUCTION_STATUSES, priorityMeta } from "@/features/production/production-meta";

export const Route = createFileRoute("/_authenticated/erp/production/")({
  head: () => ({ meta: [{ title: "Producción — Grupo Getova" }] }),
  component: ProductionList,
});

function ProductionList() {
  const { selectedBrandId } = useBrand();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["production-orders", selectedBrandId, statusFilter],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      let query = supabase
        .from("production_orders")
        .select(`
          id, code, status, priority, workshop, assigned_to_label, due_date, created_at,
          order:orders!order_id(id, order_number, invoice_number, customer_name, total)
        `)
        .eq("brand_id", selectedBrandId!)
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return q.data ?? [];
    return (q.data ?? []).filter((r: any) =>
      r.code?.toLowerCase().includes(term) ||
      r.workshop?.toLowerCase().includes(term) ||
      r.assigned_to_label?.toLowerCase().includes(term) ||
      r.order?.order_number?.toLowerCase().includes(term) ||
      r.order?.customer_name?.toLowerCase().includes(term),
    );
  }, [q.data, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <Factory className="h-5 w-5 text-primary" /> Producción
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Órdenes de producción, asignaciones y planimetrías por venta.
          </p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar código, cliente, taller…" className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {PRODUCTION_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {q.isLoading ? (
        <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Factory className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">Sin órdenes de producción</p>
          <p className="text-xs text-muted-foreground mt-1">Crea una desde el detalle de una venta.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r: any) => {
            const prio = priorityMeta(r.priority);
            return (
              <Link
                key={r.id} to="/erp/production/$id" params={{ id: r.id }}
                className="block rounded-xl border border-border bg-surface p-4 hover:border-primary/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono text-sm font-semibold">{r.code}</p>
                      <ProductionStatusBadge status={r.status} />
                      <span className={`text-[11px] font-medium ${prio.color}`}>● {prio.label}</span>
                    </div>
                    <p className="text-sm mt-1 truncate">
                      {r.order?.customer_name ?? "—"}
                      {r.order?.order_number && <span className="text-muted-foreground"> · venta {r.order.order_number}</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {r.workshop && <>Taller: <span className="text-foreground">{r.workshop}</span> · </>}
                      {r.assigned_to_label && <>Encargado: <span className="text-foreground">{r.assigned_to_label}</span> · </>}
                      {r.due_date && <>Entrega: <span className="text-foreground">{new Date(r.due_date).toLocaleDateString("es-CO")}</span></>}
                    </p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
