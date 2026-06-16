// Returns urgency classification for an estimated delivery date.
// - overdue: date has passed
// - today: due today
// - soon: due within 3 days
// - upcoming: due within 7 days
// - normal: more than 7 days away
// - none: no date set

export type DeliveryUrgency = "overdue" | "today" | "soon" | "upcoming" | "normal" | "none";

export function getDeliveryUrgency(date: string | null | undefined): {
  urgency: DeliveryUrgency;
  daysDiff: number | null;
  label: string;
} {
  if (!date) return { urgency: "none", daysDiff: null, label: "Sin fecha" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date + "T00:00:00");
  const diffMs = target.getTime() - today.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  let urgency: DeliveryUrgency;
  let label: string;
  if (days < 0) {
    urgency = "overdue";
    label = days === -1 ? "Vencida hace 1 día" : `Vencida hace ${Math.abs(days)} días`;
  } else if (days === 0) {
    urgency = "today";
    label = "Entrega hoy";
  } else if (days <= 3) {
    urgency = "soon";
    label = days === 1 ? "Entrega mañana" : `En ${days} días`;
  } else if (days <= 7) {
    urgency = "upcoming";
    label = `En ${days} días`;
  } else {
    urgency = "normal";
    label = `En ${days} días`;
  }
  return { urgency, daysDiff: days, label };
}

// Tailwind classes per urgency for a "chip" style badge.
export function urgencyChipClasses(urgency: DeliveryUrgency): string {
  switch (urgency) {
    case "overdue":
      return "bg-destructive/15 text-destructive border border-destructive/30";
    case "today":
      return "bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30";
    case "soon":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30";
    case "upcoming":
      return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border border-yellow-500/20";
    case "normal":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20";
    case "none":
    default:
      return "bg-muted text-muted-foreground border border-border";
  }
}

export function formatDeliveryDate(date: string | null | undefined, opts?: { long?: boolean }) {
  if (!date) return "Sin fecha";
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString(
    "es-CO",
    opts?.long
      ? { day: "numeric", month: "long", year: "numeric" }
      : { day: "numeric", month: "short", year: "numeric" },
  );
}
