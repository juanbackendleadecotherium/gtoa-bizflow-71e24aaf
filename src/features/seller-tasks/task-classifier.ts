/**
 * Clasifica cada `seller_tasks.type` como una **tarea accionable** (el
 * usuario debe hacer algo concreto para resolverla) o una **notificación**
 * (informativa: enterarse y archivar).
 *
 * La distinción es puramente visual — no modifica cómo se crean o resuelven
 * las tareas en la base de datos.
 */

/** Tipos donde el usuario TIENE que hacer una acción para que se resuelva. */
export const ACTIONABLE_TYPES = new Set<string>([
  "upload_planimetry",
  "fix_planimetry",
  "partial_shipment",
  "invoice_ready_for_collection",
  "pay_supplier_advance",
  "confirm_supplier_final_payment",
  "approval_pending",
  "commission_approval",
  "commission_ready_to_pay",
  "production_review_op",
]);

/** Tipos puramente informativos — se ven y se archivan con "Visto". */
export const NOTIFICATION_TYPES = new Set<string>([
  "production_started",
  "production_accepted",
  "approval_granted",
  "supplier_advance_paid",
  "partial_shipment_forms_done",
  "invoice_collection_forms_done",
  "commission_new",
  "commission_approved",
  "commission_paid",
  "commission_rejected",
  "commission_rejected_notice",
]);

export type TaskKind = "task" | "notification";

export function classifyTaskType(type: string | null | undefined): TaskKind {
  if (!type) return "notification";
  if (ACTIONABLE_TYPES.has(type)) return "task";
  if (NOTIFICATION_TYPES.has(type)) return "notification";
  // Por defecto tratamos lo desconocido como notificación (menos ruido).
  return "notification";
}
