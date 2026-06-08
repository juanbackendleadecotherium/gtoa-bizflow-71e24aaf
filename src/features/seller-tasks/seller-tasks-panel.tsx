import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Task = {
  id: string;
  title: string;
  reason: string | null;
  production_order_id: string | null;
  created_at: string;
};

/** Inline badge for a specific order — shows pending fix tasks for the seller. */
export function OrderSellerTasksBadge({ orderId }: { orderId: string }) {
  const q = useQuery({
    queryKey: ["seller-tasks", "by-order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seller_tasks")
        .select("id, title, reason, production_order_id, created_at")
        .eq("order_id", orderId)
        .eq("status", "pendiente")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
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
        {tasks.map((t) => (
          <li key={t.id} className="rounded-lg bg-background border border-amber-500/30 p-3 text-sm">
            <p className="font-semibold text-amber-900 dark:text-amber-200">{t.title}</p>
            {t.reason ? (
              <div className="mt-2 rounded-md bg-amber-500/10 border border-amber-500/30 p-2.5">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-300 mb-1">
                  Qué debes corregir
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{t.reason}</p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground italic">
                Sin detalle. Contacta a producción.
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Carga la planimetría corregida desde esta venta para reenviarla a producción.
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Sidebar-style pending count for the current user. */
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
