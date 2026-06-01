import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Factory, Loader2, ExternalLink, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ProductionStatusBadge } from "./status-badge";

export function ProductionSection({ orderId, brandId }: { orderId: string; brandId: string }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ["production-by-order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_orders")
        .select("id, code, status, workshop, assigned_to_label, due_date, created_at")
        .eq("order_id", orderId).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("production_orders").insert({
        order_id: orderId, brand_id: brandId,
      }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      toast.success("Orden de producción creada");
      qc.invalidateQueries({ queryKey: ["production-by-order", orderId] });
      qc.invalidateQueries({ queryKey: ["production-orders"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
    onSettled: () => setCreating(false),
  });

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Factory className="h-4 w-4" /> Producción
        </h2>
        <Button size="sm" variant="outline" onClick={() => { setCreating(true); create.mutate(); }}
          disabled={creating || create.isPending} className="gap-1">
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Enviar a producción
        </Button>
      </div>

      {list.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (list.data ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">Esta venta aún no tiene órdenes de producción.</p>
      ) : (
        <ul className="space-y-2">
          {(list.data ?? []).map((p: any) => (
            <li key={p.id}>
              <Link to="/erp/production/$id" params={{ id: p.id }}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background p-3 hover:border-primary/50 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-mono text-sm font-medium">{p.code}</p>
                    <ProductionStatusBadge status={p.status} />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {p.workshop && <>{p.workshop} · </>}
                    {p.assigned_to_label && <>{p.assigned_to_label} · </>}
                    {p.due_date && <>Entrega {new Date(p.due_date).toLocaleDateString("es-CO")}</>}
                  </p>
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
