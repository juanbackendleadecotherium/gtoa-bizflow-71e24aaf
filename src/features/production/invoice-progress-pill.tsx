import { CheckCircle2, PackageCheck } from "lucide-react";

export function InvoiceProgressPill({
  finished,
  total,
  className = "",
}: {
  finished: number;
  total: number;
  className?: string;
}) {
  if (total <= 0) return null;
  const done = finished >= total;
  const cls = done
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40"
    : "bg-muted text-foreground border-border";
  const Icon = done ? CheckCircle2 : PackageCheck;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls} ${className}`}
      title={done ? "Todos los productos están terminados" : `${finished} de ${total} productos terminados`}
    >
      <Icon className="h-3 w-3" />
      {finished}/{total} {done ? "listos" : "terminados"}
    </span>
  );
}
