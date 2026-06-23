import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, ListTodo, Loader2, ArrowRight, AlertTriangle, Rocket, Check, FileUp, Clock, AlertOctagon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { computeDeadlineState } from "@/features/seller-tasks/planimetry-deadline";

export const Route = createFileRoute("/_authenticated/erp/my-tasks")({
  head: () => ({ meta: [{ title: "Mis tareas — Grupo Getova" }] }),
  component: MyTasks,
});

type Task = {
  id: string;
  title: string;
  reason: string | null;
  type: string;
  status: string;
  severity: string | null;
  created_at: string;
  resolved_at: string | null;
  order_id: string | null;
  production_order_id: string | null;
  brand_id: string;
  planimetry_due_at: string | null;
};

function MyTasks() {
  const session = useSession();
  const qc = useQueryClient();
  const userId = session.session?.user.id;
  const [tab, setTab] = useState<"pendiente" | "resuelta">("pendiente");

  const q = useQuery({
    queryKey: ["my-tasks", userId, tab],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seller_tasks")
        .select("id, title, reason, type, status, severity, created_at, resolved_at, order_id, production_order_id, brand_id, planimetry_due_at")
        .eq("seller_id", userId!)
        .eq("status", tab)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });

  const markSeen = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("seller_tasks")
        .update({ status: "resuelta", resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Aviso archivado");
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      qc.invalidateQueries({ queryKey: ["my-tasks-count"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const tasks = q.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
          <ListTodo className="h-5 w-5 text-primary" /> Mis tareas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pendientes que producción te devolvió. Resuélvelas para no detener la venta.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "pendiente" | "resuelta")}>
        <TabsList>
          <TabsTrigger value="pendiente" className="gap-2">
            <AlertTriangle className="h-3.5 w-3.5" /> Pendientes
          </TabsTrigger>
          <TabsTrigger value="resuelta" className="gap-2">
            <CheckCircle2 className="h-3.5 w-3.5" /> Resueltas
          </TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          {q.isLoading ? (
            <div className="py-12 text-center">
              <Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center">
              <ListTodo className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">
                {tab === "pendiente" ? "Sin tareas pendientes 🎉" : "Aún no has resuelto tareas."}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {tasks.map((t) => {
                const isInfo = t.severity === "info" || t.type === "production_started";
                const isPlanimetry = t.type === "upload_planimetry";
                const pending = t.status === "pendiente";
                const deadline = isPlanimetry && pending ? computeDeadlineState(t.planimetry_due_at) : null;
                const overdue = deadline?.isOverdue ?? false;
                const wrapCls = overdue
                  ? "border-red-500/60 bg-red-500/5"
                  : isInfo
                    ? (pending ? "border-blue-500/50 bg-blue-500/5" : "border-border bg-surface")
                    : (pending ? "border-amber-500/50 bg-amber-500/5" : "border-border bg-surface");
                const Icon = overdue ? AlertOctagon : isPlanimetry ? FileUp : isInfo ? Rocket : AlertTriangle;
                const iconCls = overdue
                  ? "text-red-600 dark:text-red-400"
                  : isInfo
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-amber-600 dark:text-amber-400";
                const ctaLabel = isPlanimetry
                  ? "Subir planimetría"
                  : isInfo
                    ? "Ver venta"
                    : "Ir a la venta para corregir";
                return (
                  <li key={t.id} className={`rounded-xl border p-4 ${wrapCls}`}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold inline-flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${iconCls}`} /> {t.title}
                        </p>
                        {t.reason ? (
                          <div className={`mt-2 rounded-md p-2.5 border ${isInfo ? "bg-blue-500/10 border-blue-500/30" : "bg-amber-500/10 border-amber-500/30"}`}>
                            {!isInfo && (
                              <p className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-300 mb-1">
                                {isPlanimetry ? "Acción requerida" : "Qué debes corregir"}
                              </p>
                            )}
                            <p className="text-sm text-foreground whitespace-pre-wrap">{t.reason}</p>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-1 italic">Sin detalle.</p>
                        )}
                        <p className="text-[11px] text-muted-foreground mt-2">
                          Creada: {new Date(t.created_at).toLocaleString("es-CO")}
                          {t.resolved_at && (
                            <> · Resuelta: {new Date(t.resolved_at).toLocaleString("es-CO")}</>
                          )}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {t.order_id && (
                          <Link
                            to="/erp/orders/$id"
                            params={{ id: t.order_id }}
                            className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
                          >
                            {ctaLabel} <ArrowRight className="h-3 w-3" />
                          </Link>
                        )}
                        {isInfo && pending && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 h-7 text-xs"
                            onClick={() => markSeen.mutate(t.id)}
                            disabled={markSeen.isPending && markSeen.variables === t.id}
                          >
                            {markSeen.isPending && markSeen.variables === t.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Check className="h-3 w-3" />} Visto
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
