import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Bookmark, Clock3, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/features/orders/order-items-editor";
import { useBrand } from "@/features/brands/brand-context";
import { SaleTypeBadge, ApprovalStatusBadge } from "@/features/orders/sale-type-badge";

type OrderLite = {
  id: string;
  total: number | null;
  advance_amount: number | null;
  sale_type: string | null;
  separe_activated_at: string | null;
  separe_completed_at: string | null;
  approval_status: string | null;
  approval_requested_at: string | null;
  approval_resolved_at: string | null;
  approval_note: string | null;
};

/**
 * Muestra el estado del "tipo de venta" (normal / Plan Separe) y del flujo de
 * aprobación gerencial en el detalle de la orden. Se apoya en `order_payments`
 * para calcular el % pagado (Plan Separe).
 */
export function SaleFlowCard({
  order,
  paidTotal,
}: {
  order: OrderLite;
  paidTotal: number;
}) {
  const qc = useQueryClient();
  const { isAdmin } = useBrand();
  const [decisionNote, setDecisionNote] = useState("");

  const total = Number(order.total ?? 0);
  const pct = total > 0 ? Math.min(100, (paidTotal / total) * 100) : 0;
  const isSepare = order.sale_type === "plan_separe";
  const separeDone = !!order.separe_completed_at;


  const resolve = useMutation({
    mutationFn: async (decision: "aprobada" | "rechazada") => {
      if (!decisionNote.trim() && decision === "rechazada") {
        throw new Error("Escribe el motivo del rechazo");
      }
      const { error } = await supabase.rpc("resolve_management_approval", {
        p_order_id: order.id,
        p_decision: decision,
        p_note: decisionNote.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Decisión registrada");
      setDecisionNote("");
      qc.invalidateQueries({ queryKey: ["order", order.id] });
      qc.invalidateQueries({ queryKey: ["order-approvals-pending"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <section className="rounded-xl border border-border bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Bookmark className="h-4 w-4" /> Tipo de venta y aprobación
        </h2>
        <div className="flex gap-1.5 flex-wrap">
          <SaleTypeBadge saleType={order.sale_type} separeCompletedAt={order.separe_completed_at} />
          <ApprovalStatusBadge status={order.approval_status} />
        </div>
      </div>

      {/* Plan Separe: barra de progreso */}
      {isSepare && (
        <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Progreso hacia el 50% ({formatMoney(paidTotal)} de {formatMoney(total * 0.5)})
            </span>
            <span className={`font-semibold tabular-nums ${separeDone ? "text-emerald-600" : "text-violet-600"}`}>
              {pct.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full transition-all ${separeDone ? "bg-emerald-500" : "bg-violet-500"}`}
              style={{ width: `${Math.min(100, (paidTotal / (total * 0.5 || 1)) * 100)}%` }}
            />
          </div>
          {separeDone ? (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Separe completado el {new Date(order.separe_completed_at!).toLocaleDateString("es-CO")}. Ya puedes enviar a producción.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              El precio quedó congelado al crear el separe. Producción se habilita al alcanzar el 50%.
            </p>
          )}
        </div>
      )}

      {/* Aprobación pendiente */}
      {order.approval_status === "pendiente" && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
            <Clock3 className="h-3.5 w-3.5" /> Esperando decisión de gerencia
          </p>
          {order.approval_note && (
            <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">
              <span className="font-medium text-foreground">Motivo:</span> {order.approval_note}
            </p>
          )}
          {isAdmin && (
            <div className="space-y-2 pt-2 border-t border-amber-500/20">
              <Textarea
                placeholder="Comentario para el vendedor (opcional al aprobar, obligatorio al rechazar)…"
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                rows={2}
                className="text-xs"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="default" className="gap-1"
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate("aprobada")}>
                  {resolve.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Aprobar
                </Button>
                <Button size="sm" variant="outline" className="gap-1 border-rose-500/40 text-rose-600 hover:bg-rose-500/10"
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate("rechazada")}>
                  <XCircle className="h-3.5 w-3.5" /> Rechazar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {order.approval_status === "aprobada" && (
        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> Aprobada el {order.approval_resolved_at ? new Date(order.approval_resolved_at).toLocaleDateString("es-CO") : ""}. Puede enviarse a producción.
        </p>
      )}

      {order.approval_status === "rechazada" && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-[11px] text-rose-700 dark:text-rose-400">
          <p className="font-medium">Aprobación rechazada por gerencia.</p>
          {order.approval_note && <p className="mt-1 whitespace-pre-wrap">{order.approval_note}</p>}
        </div>
      )}

      {/* CTA para solicitar aprobación (excepción de anticipo) */}
      {showApprovalCTA && (
        <div className="rounded-lg border border-border p-3 space-y-2">
          <p className="text-xs flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">Solicitar excepción de anticipo</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            El anticipo actual está por debajo del 50%. Explica a gerencia por qué esta venta debe entrar a producción sin cumplir el mínimo.
          </p>
          <Textarea
            placeholder="Motivo (ej. cliente estratégico, plazo especial…)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="text-xs"
          />
          <Button size="sm" variant="outline" className="gap-1"
            disabled={requestApproval.isPending || !note.trim()}
            onClick={() => requestApproval.mutate()}>
            {requestApproval.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            Solicitar aprobación gerencial
          </Button>
        </div>
      )}
    </section>
  );
}
