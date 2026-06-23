import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertOctagon, ArrowRight, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { computeDeadlineState } from "./planimetry-deadline";

type Row = {
  id: string;
  title: string;
  reason: string | null;
  created_at: string;
  planimetry_due_at: string | null;
  seller_id: string;
  order_id: string | null;
};

type Profile = { user_id: string; display_name: string | null; email: string | null };
type OrderRef = { id: string; order_number: string | null; customer_name: string | null };

/**
 * Banner para el gerente (admin) que alerta cuando uno o más vendedores
 * llevan más de 2 días hábiles sin subir planimetría.
 */
export function OverduePlanimetriesAdminAlert() {
  const { isAdmin } = useBrand();

  const q = useQuery({
    queryKey: ["overdue-planimetries-admin"],
    enabled: isAdmin,
    refetchInterval: 60_000,
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data: tasks, error } = await supabase
        .from("seller_tasks")
        .select("id, title, reason, created_at, planimetry_due_at, seller_id, order_id")
        .eq("type", "upload_planimetry")
        .eq("status", "pendiente")
        .lt("planimetry_due_at", nowIso)
        .order("planimetry_due_at", { ascending: true });
      if (error) throw error;
      const rows = (tasks ?? []) as Row[];
      if (rows.length === 0) return { rows: [], profiles: new Map(), orders: new Map() };

      const sellerIds = Array.from(new Set(rows.map((r) => r.seller_id))).filter(Boolean);
      const orderIds = Array.from(new Set(rows.map((r) => r.order_id).filter(Boolean) as string[]));

      const [{ data: profs }, { data: ords }] = await Promise.all([
        sellerIds.length
          ? supabase.from("profiles").select("user_id, display_name, email").in("user_id", sellerIds)
          : Promise.resolve({ data: [] as Profile[] }),
        orderIds.length
          ? supabase.from("orders").select("id, order_number, customer_name").in("id", orderIds)
          : Promise.resolve({ data: [] as OrderRef[] }),
      ]);

      const profiles = new Map((profs ?? []).map((p: any) => [p.user_id, p as Profile]));
      const orders = new Map((ords ?? []).map((o: any) => [o.id, o as OrderRef]));
      return { rows, profiles, orders };
    },
  });

  if (!isAdmin || !q.data || q.data.rows.length === 0) return null;

  const { rows, profiles, orders } = q.data;

  // Group by seller
  const grouped = new Map<string, Row[]>();
  for (const r of rows) {
    const list = grouped.get(r.seller_id) ?? [];
    list.push(r);
    grouped.set(r.seller_id, list);
  }

  return (
    <div className="rounded-xl border-2 border-red-500/60 bg-red-500/10 p-4 space-y-3 shadow-sm">
      <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
        <AlertOctagon className="h-5 w-5" />
        <p className="text-sm font-semibold">
          Planimetrías vencidas ({rows.length}) — más de 2 días hábiles sin subir
        </p>
      </div>
      <ul className="space-y-2">
        {Array.from(grouped.entries()).map(([sellerId, list]) => {
          const prof = profiles.get(sellerId);
          const name = prof?.display_name || prof?.email || "Vendedor sin nombre";
          const oldest = list[0];
          const state = computeDeadlineState(oldest.planimetry_due_at);
          return (
            <li
              key={sellerId}
              className="rounded-lg bg-background border border-red-500/30 p-3 text-sm space-y-2"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-semibold text-red-900 dark:text-red-200">{name}</p>
                  <p className="text-xs text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" />
                    {list.length} planimetría{list.length === 1 ? "" : "s"} vencida{list.length === 1 ? "" : "s"}
                    {state && <> · más vieja: {state.label.toLowerCase()}</>}
                  </p>
                </div>
              </div>
              <ul className="space-y-1">
                {list.slice(0, 5).map((t) => {
                  const ord = t.order_id ? orders.get(t.order_id) : undefined;
                  return (
                    <li key={t.id} className="text-xs flex items-center justify-between gap-2 border-t border-red-500/15 pt-1.5">
                      <span className="truncate text-muted-foreground">
                        {ord?.order_number ?? "Venta"} · {ord?.customer_name ?? "—"} · {t.title}
                      </span>
                      {t.order_id && (
                        <Link
                          to="/erp/orders/$id"
                          params={{ id: t.order_id }}
                          className="text-red-600 dark:text-red-300 inline-flex items-center gap-1 hover:underline shrink-0"
                        >
                          Ver venta <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </li>
                  );
                })}
                {list.length > 5 && (
                  <li className="text-[11px] text-muted-foreground italic pt-1">
                    y {list.length - 5} más…
                  </li>
                )}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
