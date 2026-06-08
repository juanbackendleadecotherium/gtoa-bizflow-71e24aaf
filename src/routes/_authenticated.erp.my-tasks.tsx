import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, ListTodo, Loader2, ArrowRight, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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
  created_at: string;
  resolved_at: string | null;
  order_id: string | null;
  production_order_id: string | null;
  brand_id: string;
};

function MyTasks() {
  const session = useSession();
  const userId = session.session?.user.id;
  const [tab, setTab] = useState<"pendiente" | "resuelta">("pendiente");

  const q = useQuery({
    queryKey: ["my-tasks", userId, tab],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seller_tasks")
        .select("id, title, reason, type, status, created_at, resolved_at, order_id, production_order_id, brand_id")
        .eq("seller_id", userId!)
        .eq("status", tab)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
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
              {tasks.map((t) => (
                <li key={t.id} className={`rounded-xl border p-4 ${t.status === "pendiente" ? "border-amber-500/50 bg-amber-500/5" : "border-border bg-surface"}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{t.title}</p>
                      {t.reason ? (
                        <div className="mt-2 rounded-md bg-amber-500/10 border border-amber-500/30 p-2.5">
                          <p className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-300 mb-1">
                            Qué debes corregir
                          </p>
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
                      {t.production_order_id && (
                        <Link
                          to="/erp/production/$id"
                          params={{ id: t.production_order_id }}
                          className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
                        >
                          Ir a producción <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                      {t.order_id && (
                        <Link
                          to="/erp/orders/$id"
                          params={{ id: t.order_id }}
                          className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
                        >
                          Ir a venta <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
