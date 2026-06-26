export const NOVEDADES = [
  { value: "pendiente", label: "Pendiente", color: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30" },
  { value: "cotizando", label: "Cotizando", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  { value: "produccion", label: "Producción", color: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30" },
  { value: "pendiente_por_logistica", label: "Pendiente por logística", color: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30" },
  { value: "entrega_inmediata", label: "Entrega inmediata", color: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30" },
  { value: "entregada", label: "Entregada", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  { value: "anulada", label: "Anulada", color: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30" },
] as const;

export type Novedad = (typeof NOVEDADES)[number]["value"];

export function novedadMeta(n: string | null | undefined) {
  return NOVEDADES.find((x) => x.value === n) ?? NOVEDADES[0];
}

export function NovedadBadge({ value }: { value: string | null | undefined }) {
  const m = novedadMeta(value);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${m.color}`}>
      {m.label}
    </span>
  );
}
