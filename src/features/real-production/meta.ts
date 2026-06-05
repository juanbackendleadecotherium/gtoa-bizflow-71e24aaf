export const STAGES = [
  { value: "planimetria", label: "Revisar planimetría", group: "produccion", color: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30" },
  { value: "proveedor", label: "Selección proveedor", group: "produccion", color: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30" },
  { value: "negociacion", label: "Negociación", group: "produccion", color: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30" },
  { value: "aprobado", label: "Proveedor aprobado", group: "produccion", color: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30" },
  { value: "seguimiento", label: "Seguimiento producción", group: "produccion", color: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30" },
  { value: "terminado", label: "Terminado", group: "produccion", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  { value: "control_calidad", label: "Control de calidad", group: "logistica", color: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30" },
  { value: "entrega", label: "En entrega", group: "logistica", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  { value: "entregado", label: "Entregado", group: "logistica", color: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30" },
  { value: "cancelado", label: "Cancelado", group: "produccion", color: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30" },
] as const;

export type Stage = (typeof STAGES)[number]["value"];

export const PRODUCTION_STAGES: Stage[] = ["planimetria", "proveedor", "negociacion", "aprobado", "seguimiento", "terminado"];
export const LOGISTICA_STAGES: Stage[] = ["control_calidad", "entrega", "entregado"];

export function stageMeta(s: string) {
  return STAGES.find((x) => x.value === s) ?? STAGES[0];
}

/** Auto-advance rule: when Producción marks terminado, Logística picks it up at control_calidad. */
export function nextStageOnTerminado(): Stage { return "control_calidad"; }

export const DELIVERY_TARGETS = [
  { value: "cliente", label: "Cliente" },
  { value: "bodega", label: "Bodega" },
] as const;
