export function marginTone(pct: number | null | undefined, min: number) {
  if (pct == null) return "muted" as const;
  if (pct >= min) return "ok" as const;
  if (pct >= min - 15) return "warn" as const;
  return "bad" as const;
}

const TONE_CLASS: Record<"ok" | "warn" | "bad" | "muted", string> = {
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  warn: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  bad: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  muted: "bg-muted text-muted-foreground border-border",
};

const DOT_CLASS: Record<"ok" | "warn" | "bad" | "muted", string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-rose-500",
  muted: "bg-muted-foreground/40",
};

export function MarginPill({
  pct,
  min,
  className = "",
}: {
  pct: number | null | undefined;
  min: number;
  className?: string;
}) {
  const tone = marginTone(pct, min);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${TONE_CLASS[tone]} ${className}`}
      title={`Mínimo requerido: ${min}%`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[tone]}`} />
      {pct == null ? "Sin costo" : `${pct.toFixed(1)}%`}
    </span>
  );
}
