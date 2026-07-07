import { Bookmark, Clock3, CheckCircle2, XCircle, HandCoins } from "lucide-react";
import { formatMoney } from "@/features/orders/order-items-editor";
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
  paulatino_authorized_by_email?: string | null;
  paulatino_authorized_at?: string | null;
  paulatino_advance_at_send?: number | null;
};

/**
 * Muestra el estado del "tipo de venta" (normal / Plan Separe / Pago Paulatino)
 * y del flujo de aprobación gerencial en el detalle de la orden.
 */
export function SaleFlowCard({
  order,
  paidTotal,
}: {
  order: OrderLite;
  paidTotal: number;
}) {
  const total = Number(order.total ?? 0);
  const pct = total > 0 ? Math.min(100, (paidTotal / total) * 100) : 0;
  const isSepare = order.sale_type === "plan_separe";
  const isPaulatino = order.sale_type === "pago_paulatino";
  const separeDone = !!order.separe_completed_at;

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

      {isPaulatino && (
        <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 space-y-1.5">
          <p className="text-xs font-medium text-orange-700 dark:text-orange-400 flex items-center gap-1">
            <HandCoins className="h-3.5 w-3.5" /> Excepción autorizada por el vendedor
          </p>
          <p className="text-[11px] text-muted-foreground">
            Producción se puede iniciar con cualquier anticipo, sin pasar por gerencia. El vendedor asume el recaudo del saldo.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
            <div>
              <span className="text-muted-foreground block">Autorizó</span>
              <span className="font-medium text-foreground">
                {order.paulatino_authorized_by_email ?? "—"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Fecha</span>
              <span className="font-medium text-foreground">
                {order.paulatino_authorized_at
                  ? new Date(order.paulatino_authorized_at).toLocaleString("es-CO")
                  : "—"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Anticipo al enviar a producción</span>
              <span className="font-medium tabular-nums text-foreground">
                {order.paulatino_advance_at_send != null
                  ? formatMoney(Number(order.paulatino_advance_at_send))
                  : "— aún no enviado"}
              </span>
            </div>
          </div>
        </div>
      )}

      {order.approval_status === "pendiente" && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-1">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
            <Clock3 className="h-3.5 w-3.5" /> Esperando decisión de gerencia
          </p>
          {order.approval_note && (
            <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">
              <span className="font-medium text-foreground">Motivo:</span> {order.approval_note}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            La decisión se toma desde "Mis tareas" del administrador.
          </p>
        </div>
      )}

      {order.approval_status === "aprobada" && (
        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> Aprobada el {order.approval_resolved_at ? new Date(order.approval_resolved_at).toLocaleDateString("es-CO") : ""}. Puede enviarse a producción.
        </p>
      )}

      {order.approval_status === "rechazada" && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-[11px] text-rose-700 dark:text-rose-400 flex items-start gap-1">
          <XCircle className="h-3.5 w-3.5 mt-0.5" />
          <div>
            <p className="font-medium">Aprobación rechazada por gerencia.</p>
            {order.approval_note && <p className="mt-1 whitespace-pre-wrap">{order.approval_note}</p>}
          </div>
        </div>
      )}
    </section>
  );
}

