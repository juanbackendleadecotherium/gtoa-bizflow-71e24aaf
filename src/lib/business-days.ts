// Days off in Colombia. Sundays are always non-working; Saturdays count
// as half-day (we treat them as working). Holidays here include both fixed
// dates and Ley Emiliani holidays already shifted to the corresponding
// Monday. Extend each year as needed.
const CO_HOLIDAYS: ReadonlySet<string> = new Set<string>([
  // 2025
  "2025-01-01","2025-01-06","2025-03-24","2025-04-17","2025-04-18",
  "2025-05-01","2025-06-02","2025-06-23","2025-06-30","2025-07-20",
  "2025-08-07","2025-08-18","2025-10-13","2025-11-03","2025-11-17",
  "2025-12-08","2025-12-25",
  // 2026
  "2026-01-01","2026-01-12","2026-03-23","2026-04-02","2026-04-03",
  "2026-05-01","2026-05-18","2026-06-08","2026-06-15","2026-07-20",
  "2026-08-07","2026-08-17","2026-10-12","2026-11-02","2026-11-16",
  "2026-12-08","2026-12-25",
  // 2027 — extender cada año
  "2027-01-01","2027-01-11","2027-03-22","2027-03-25","2027-03-26",
  "2027-05-01","2027-05-10","2027-05-31","2027-06-07","2027-07-05",
  "2027-07-20","2027-08-16","2027-10-18","2027-11-01","2027-11-15",
  "2027-12-08","2027-12-25",
]);

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isBusinessDay(d: Date): boolean {
  const dow = d.getDay(); // 0=Sun, 6=Sat
  if (dow === 0) return false;
  if (CO_HOLIDAYS.has(toISO(d))) return false;
  return true;
}

/** Subtract `n` business days from an ISO date (yyyy-mm-dd). Returns ISO. */
export function subtractBusinessDays(isoDate: string | null | undefined, n: number): string | null {
  if (!isoDate) return null;
  const d = new Date(isoDate + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() - 1);
    if (isBusinessDay(d)) left -= 1;
  }
  return toISO(d);
}
