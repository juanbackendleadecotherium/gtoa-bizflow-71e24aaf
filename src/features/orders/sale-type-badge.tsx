import { Bookmark, ShoppingCart, Clock3, CheckCircle2, XCircle, HandCoins, Truck } from "lucide-react";

export function SaleTypeBadge({
  saleType,
  separeCompletedAt,
}: {
  saleType?: string | null;
  separeCompletedAt?: string | null;
}) {
  if (saleType === "plan_separe") {
    if (separeCompletedAt) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-medium">
          <Bookmark className="h-3 w-3" /> Separe completado
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/30 px-2 py-0.5 text-[11px] font-medium">
        <Bookmark className="h-3 w-3" /> Plan Separe
      </span>
    );
  }
  if (saleType === "pago_paulatino") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30 px-2 py-0.5 text-[11px] font-medium">
        <HandCoins className="h-3 w-3" /> Pago Paulatino
      </span>
    );
  }
  if (saleType === "entrega_inmediata") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 px-2 py-0.5 text-[11px] font-medium">
        <Truck className="h-3 w-3" /> Entrega inmediata
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground border border-border px-2 py-0.5 text-[11px] font-medium">
      <ShoppingCart className="h-3 w-3" /> Venta normal
    </span>
  );
}

export function ApprovalStatusBadge({ status }: { status?: string | null }) {
  if (!status || status === "no_requerida") return null;
  if (status === "pendiente") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-2 py-0.5 text-[11px] font-medium">
        <Clock3 className="h-3 w-3" /> Aprobación pendiente
      </span>
    );
  }
  if (status === "aprobada") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-medium">
        <CheckCircle2 className="h-3 w-3" /> Aprobada por gerencia
      </span>
    );
  }
  if (status === "rechazada") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 px-2 py-0.5 text-[11px] font-medium">
        <XCircle className="h-3 w-3" /> Aprobación rechazada
      </span>
    );
  }
  return null;
}

/**
 * Determina si una orden puede enviarse a producción según su tipo de venta
 * y estado de aprobación gerencial.
 */
export function canSendToProduction(order: {
  sale_type?: string | null;
  separe_completed_at?: string | null;
  approval_status?: string | null;
  advance_amount?: number | null;
  total?: number | null;
}): { ok: boolean; reason?: string } {
  const total = Number(order.total ?? 0);
  const advance = Number(order.advance_amount ?? 0);

  // Entrega inmediata: producto ya listo, no pasa por producción.
  if (order.sale_type === "entrega_inmediata") {
    return { ok: false, reason: "Venta de entrega inmediata: no requiere producción." };
  }


  // Pago Paulatino: excepción autorizada por el vendedor. No exige 50% ni
  // aprobación gerencial. Cualquier anticipo (incluido 0) habilita producción.
  if (order.sale_type === "pago_paulatino") {
    return { ok: true };
  }

  // Plan Separe: requiere 30% completado
  if (order.sale_type === "plan_separe") {
    if (!order.separe_completed_at) {
      const pct = total > 0 ? (advance / total) * 100 : 0;
      return {
        ok: false,
        reason: `Plan Separe: falta completar el 30% del anticipo (actual ${pct.toFixed(1)}%).`,
      };
    }
  }

  // Aprobación gerencial: pendiente o rechazada bloquea
  if (order.approval_status === "pendiente") {
    return { ok: false, reason: "Aprobación gerencial pendiente. Espera la decisión antes de enviar a producción." };
  }
  if (order.approval_status === "rechazada") {
    return { ok: false, reason: "Aprobación gerencial rechazada. Contacta a gerencia." };
  }

  return { ok: true };
}

