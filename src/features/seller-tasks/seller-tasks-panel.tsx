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
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
        <AlertTriangle className="h-4 w-4" />
        <p className="text-sm font-semibold">
          Tareas pendientes para ti ({tasks.length})
        </p>
      </div>
      <ul className="space-y-2">
        {tasks.map((t) => (
          <li key={t.id} className="rounded-lg bg-background border border-border p-3 text-sm">
            <p className="font-medium">{t.title}</p>
            {t.reason && <p className="text-xs text-muted-foreground mt-1 italic">Motivo: "{t.reason}"</p>}
            {t.production_order_id && (
              <Link
                to="/erp/production/$id"
                params={{ id: t.production_order_id }}
                className="text-xs text-primary inline-flex items-center gap-1 mt-2 hover:underline"
              >
                Subir planimetría corregida <ArrowRight className="h-3 w-3" />
              </Link>
            )}
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
