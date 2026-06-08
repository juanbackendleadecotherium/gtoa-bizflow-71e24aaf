import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Inbox, Check, ShieldAlert, Clock, CheckCircle2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Button } from "@/components/ui/button";
import { ReasonDialog } from "@/features/production/reason-dialog";

export const Route = createFileRoute("/_authenticated/erp/production/approvals")({
  head: () => ({ meta: [{ title: "Aprobar órdenes — Producción" }] }),
  component: ApprovalsPage,
});

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}
function timeAgo(d: string | null | undefined) {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "hace un momento";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

function ApprovalsPage() {
  const { brands, selectedBrandId, setSelectedBrandId, loading } = useBrand();
  const qc = useQueryClient();
  const [rejectTarget, setRejectTarget] = useState<{ id: string; code: string } | null>(null);

  const pending = useQuery({
    queryKey: ["production-orders-pending", selectedBrandId],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_orders")
        .select(`
          id, code, status, created_at, notes,
          order:orders!order_id(id, order_number, invoice_number, customer_name, total, seller_id)
        `)
        .eq("brand_id", selectedBrandId!)
        .eq("status", "pendiente")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const accept = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("production_orders")
        .update({ status: "en_proceso", novedad: "produccion" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orden aceptada — pasa a seguimiento");
      qc.invalidateQueries({ queryKey: ["production-orders-pending"], refetchType: "all" });
      qc.invalidateQueries({ queryKey: ["production-orders-drive"], refetchType: "all" });
      qc.invalidateQueries({ queryKey: ["production-hub-counts"], refetchType: "all" });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("reject_production_with_reason", { p_id: id, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orden rechazada — se creó tarea al vendedor");
      setRejectTarget(null);
      qc.invalidateQueries({ queryKey: ["production-orders-pending"] });
      qc.invalidateQueries({ queryKey: ["production-hub-counts"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const pendingCount = pending.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/erp/production" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="h-3 w-3" /> Volver a Producción
        </Link>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 grid place-items-center">
            <Inbox className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold">Aprobar órdenes</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Acepta para iniciar producción o rechaza con motivo para devolver al vendedor.
            </p>
          </div>
        </div>
      </div>

      {!loading && brands.length > 0 && (
        <div className="flex gap-1 border-b border-border overflow-x-auto -mx-1 px-1">
          {brands.map((b) => {
            const active = b.id === selectedBrandId;
            return (
              <button key={b.id} onClick={() => setSelectedBrandId(b.id)}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}>
                <span className="inline-block h-2 w-2 rounded-full mr-2" style={{ background: b.primary_color }} />
                {b.slug.toUpperCase()}
              </button>
            );
          })}
        </div>
      )}

      <section className={`rounded-xl border bg-surface overflow-hidden ${
        pendingCount > 0 ? "border-amber-500/40 shadow-[0_0_0_3px_rgb(245_158_11_/_0.08)]" : "border-border"
      }`}>
        <div className={`px-5 py-3.5 border-b flex items-center gap-2.5 ${
          pendingCount > 0 ? "border-amber-500/30 bg-amber-500/10" : "border-border bg-muted/30"
        }`}>
          <div className={`h-8 w-8 rounded-lg grid place-items-center ${
            pendingCount > 0 ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground"
          }`}>
            <Inbox className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold leading-tight">Cola por revisar</h2>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
              {pendingCount > 0 ? `${pendingCount} ${pendingCount === 1 ? "orden pendiente" : "órdenes pendientes"}` : "Sin pendientes"}
            </p>
          </div>
          {pendingCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs font-bold bg-amber-500 text-white shadow-sm">
              {pendingCount}
            </span>
          )}
        </div>
        {pending.isLoading ? (
          <div className="py-12 text-center"><Loader2 className="h-4 w-4 animate-spin inline text-muted-foreground" /></div>
        ) : pendingCount === 0 ? (
          <div className="px-5 py-14 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500/70 mx-auto mb-2" />
            <p className="text-sm font-medium">Todo al día</p>
            <p className="text-xs text-muted-foreground mt-1">No hay órdenes pendientes de revisión.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {(pending.data ?? []).map((r: any) => (
              <li key={r.id} className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap hover:bg-muted/20 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link to="/erp/production/$id" params={{ id: r.id }}
                      className="text-sm font-semibold font-mono text-primary hover:underline">
                      {r.code}
                    </Link>
                    <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {timeAgo(r.created_at)}
                    </span>
                  </div>
                  <p className="text-sm mt-1 truncate">
                    <span className="text-muted-foreground">Venta</span>{" "}
                    <span className="font-medium">{r.order?.order_number ?? "—"}</span>
                    <span className="text-muted-foreground"> · </span>
                    <span>{r.order?.customer_name ?? "—"}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{fmtMoney(r.order?.total)}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setRejectTarget({ id: r.id, code: r.code })}
                    className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10">
                    <ShieldAlert className="h-3.5 w-3.5" /> Rechazar
                  </Button>
                  <Button size="sm" onClick={() => accept.mutate(r.id)}
                    disabled={accept.isPending} className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Check className="h-3.5 w-3.5" /> Aceptar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ReasonDialog
        open={!!rejectTarget}
        onOpenChange={(v) => !v && setRejectTarget(null)}
        title={`Rechazar ${rejectTarget?.code ?? ""}`}
        description="La orden se marcará como rechazada y se creará una tarea para que el vendedor corrija la planimetría."
        confirmLabel="Rechazar"
        pending={reject.isPending}
        onConfirm={(r) => rejectTarget && reject.mutate({ id: rejectTarget.id, reason: r })}
      />
    </div>
  );
}
