import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Factory, Plus, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { StageBadge } from "./stage-badge";

type Row = {
  id: string; code: string; stage: string;
};

export function RealProductionSection({
  orderId, brandId, orderTotal,
}: { orderId: string; brandId: string; orderTotal: number }) {
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["real-production-for-order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("real_production_orders")
        .select("id, code, stage")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("real_production_orders").insert({
        brand_id: brandId,
        order_id: orderId,
        sale_total_snapshot: orderTotal,
      }).select("id").maybeSingle();
      if (error) throw error;
      return data?.id as string;
    },
    onSuccess: () => {
      toast.success("Orden de producción real creada");
      qc.invalidateQueries({ queryKey: ["real-production-for-order", orderId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const existing = list.data ?? [];

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Factory className="h-4 w-4" /> Producción Real
        </h2>
        <Button size="sm" variant="outline" onClick={() => create.mutate()}
          disabled={create.isPending} className="gap-1">
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Enviar a Producción Real
        </Button>
      </div>

      {list.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : existing.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin órdenes de producción real para esta venta.</p>
      ) : (
        <ul className="space-y-2">
          {existing.map((p) => (
            <li key={p.id}>
              <Link to="/erp/real-production/$id" params={{ id: p.id }}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background p-3 hover:border-primary/50 transition-colors">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <p className="font-mono text-sm font-medium">{p.code}</p>
                  <StageBadge stage={p.stage} />
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
