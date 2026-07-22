import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { generatePlanimetryForOrder } from "@/features/production/send-to-production-button";

type Task = {
  id: string;
  title: string;
  reason: string | null;
  production_order_id: string | null;
  created_at: string;
};

/** Inline badge for a specific order — shows pending fix tasks for the seller. */
export function OrderSellerTasksBadge({ orderId }: { orderId: string }) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["seller-tasks", "by-order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seller_tasks")
        .select("id, title, reason, production_order_id, created_at, type")
        .eq("order_id", orderId)
        .eq("status", "pendiente")
        .eq("type", "fix_planimetry")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });

  const resend = useMutation({
    mutationFn: async (task: Task) => {
      if (!task.production_order_id) throw new Error("La tarea no tiene orden de producción asociada");

      const { data: prod, error: prodErr } = await supabase
        .from("production_orders")
        .select("id, code, brand_id, status")
        .eq("id", task.production_order_id)
        .maybeSingle();
      if (prodErr) throw prodErr;
      if (!prod) throw new Error("Orden de producción no encontrada");

      const { data: items, error: itemsErr } = await supabase
        .from("order_items")
        .select("id")
        .eq("order_id", orderId)
        .eq("production_order_id", task.production_order_id);
      if (itemsErr) throw itemsErr;
      const ids = (items ?? []).map((i: any) => i.id);
      if (ids.length === 0) throw new Error("No hay productos vinculados a esta orden de producción");

      await generatePlanimetryForOrder({
        productionOrderId: prod.id,
        productionCode: prod.code,
        orderId,
        brandId: prod.brand_id,
        selectedItemIds: ids,
        noteOverride: `Planimetría corregida tras rechazo: ${task.reason ?? "(sin detalle)"}`,
      });

      // Re-open the production order so the team ve la corrección nuevamente
      if (prod.status === "rechazada") {
        const { error: upErr } = await supabase
          .from("production_orders")
          .update({ status: "pendiente" })
          .eq("id", prod.id);
        if (upErr) throw upErr;
      }

      return prod.code;
    },
    onSuccess: (code) => {
      toast.success(`Actualización enviada a producción (${code})`);
      qc.invalidateQueries({ queryKey: ["seller-tasks", "by-order", orderId] });
      qc.invalidateQueries({ queryKey: ["production-by-order", orderId] });
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      qc.invalidateQueries({ queryKey: ["my-tasks-count"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tasks = q.data ?? [];
  if (q.isLoading || tasks.length === 0) return null;

  return (
    <div className="rounded-xl border-2 border-amber-500/60 bg-amber-500/10 p-4 space-y-3 shadow-sm">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
        <AlertTriangle className="h-4 w-4" />
        <p className="text-sm font-semibold">
          Producción te devolvió esta venta ({tasks.length} {tasks.length === 1 ? "tarea" : "tareas"})
        </p>
      </div>
      <ul className="space-y-2">
        {tasks.map((t) => {
          const pending = resend.isPending && resend.variables?.id === t.id;
          return (
            <li key={t.id} className="rounded-lg bg-background border border-amber-500/30 p-3 text-sm space-y-2">
              <p className="font-semibold text-amber-900 dark:text-amber-200">{t.title}</p>
              {t.reason ? (
                <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2.5">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-300 mb-1">
                    Qué debes corregir
                  </p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{t.reason}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Sin detalle. Contacta a producción.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Edita la venta (productos, imágenes o notas) y envía la actualización para regenerar la planimetría automáticamente.
              </p>
              <Button
                size="sm"
                className="w-full gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => resend.mutate(t)}
                disabled={pending}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar actualización
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

import { ACTIONABLE_TYPES } from "./task-classifier";

/** Cuenta pendiente total (tareas + notificaciones) para el sidebar. */
export function useMyPendingTasksCount(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-tasks-count", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("seller_tasks")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", userId!)
        .eq("status", "pendiente");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/** Desglose pendiente entre tareas accionables y notificaciones. */
export function useMyPendingBreakdown(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-tasks-breakdown", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seller_tasks")
        .select("type")
        .eq("seller_id", userId!)
        .eq("status", "pendiente");
      if (error) throw error;
      const rows = (data ?? []) as Array<{ type: string | null }>;
      let tasks = 0;
      let notifications = 0;
      for (const r of rows) {
        if (r.type && ACTIONABLE_TYPES.has(r.type)) tasks += 1;
        else notifications += 1;
      }
      return { tasks, notifications, total: tasks + notifications };
    },
  });
}
