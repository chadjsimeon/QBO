/** Format a Date as a yyyy-mm-dd string for <input type="date">. */
export function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Human date, e.g. "3 Jun 2026". */
export function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

/** Whole days `to` is after `from` (negative if before). */
export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
