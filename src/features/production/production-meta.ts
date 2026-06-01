export const PRODUCTION_STATUSES = [
  { value: "pendiente", label: "Pendiente", color: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30" },
  { value: "en_proceso", label: "En proceso", color: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30" },
  { value: "control_calidad", label: "Control de calidad", color: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30" },
  { value: "listo", label: "Listo para entrega", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  { value: "entregado", label: "Entregado", color: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30" },
  { value: "rechazada", label: "Rechazada", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  { value: "cancelado", label: "Cancelado", color: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30" },
] as const;

export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number]["value"];

export const PRIORITIES = [
  { value: "baja", label: "Baja", color: "text-slate-500" },
  { value: "normal", label: "Normal", color: "text-foreground" },
  { value: "alta", label: "Alta", color: "text-amber-600 dark:text-amber-400" },
  { value: "urgente", label: "Urgente", color: "text-rose-600 dark:text-rose-400" },
] as const;

export type Priority = (typeof PRIORITIES)[number]["value"];

export function statusMeta(s: string) {
  return PRODUCTION_STATUSES.find((x) => x.value === s) ?? PRODUCTION_STATUSES[0];
}
export function priorityMeta(p: string) {
  return PRIORITIES.find((x) => x.value === p) ?? PRIORITIES[1];
}
