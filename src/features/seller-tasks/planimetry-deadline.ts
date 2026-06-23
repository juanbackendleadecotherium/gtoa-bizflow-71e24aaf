/** Helpers for the 2 business-days planimetry deadline. */

export type DeadlineState = {
  /** ms until due (negative if overdue) */
  msRemaining: number;
  /** true when now > due */
  isOverdue: boolean;
  /** true when due in the next 24h (and not yet overdue) */
  isDueSoon: boolean;
  /** Friendly Spanish label: "Vence en 5h", "Vencida hace 2d" */
  label: string;
  /** semantic tone */
  tone: "ok" | "warn" | "danger";
};

function formatDelta(ms: number): string {
  const abs = Math.abs(ms);
  const m = Math.floor(abs / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ${h % 24}h`;
  if (h >= 1) return `${h}h ${m % 60}m`;
  if (m >= 1) return `${m}m`;
  return "unos segundos";
}

export function computeDeadlineState(dueAtIso: string | null | undefined, now = new Date()): DeadlineState | null {
  if (!dueAtIso) return null;
  const due = new Date(dueAtIso).getTime();
  const ms = due - now.getTime();
  const isOverdue = ms < 0;
  const isDueSoon = !isOverdue && ms < 24 * 3600 * 1000;
  return {
    msRemaining: ms,
    isOverdue,
    isDueSoon,
    label: isOverdue ? `Vencida hace ${formatDelta(ms)}` : `Vence en ${formatDelta(ms)}`,
    tone: isOverdue ? "danger" : isDueSoon ? "warn" : "ok",
  };
}
