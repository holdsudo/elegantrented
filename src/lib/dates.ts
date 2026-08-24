/**
 * Calendar-day handling.
 *
 * A party date is a day, not an instant. Postgres `date` columns come back from
 * Prisma as a Date pinned to UTC midnight, so every read and write here stays in
 * UTC and never touches the local timezone — otherwise a rental written in NJ in
 * the evening lands on the wrong day.
 */

const DAY_MS = 86_400_000;

/** "2026-09-14" -> Date at UTC midnight. Returns null for empty/invalid input. */
export function parseDay(raw: FormDataEntryValue | null | undefined): Date | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Date -> "2026-09-14", for <input type="date"> values. */
export function toInputDay(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

/** Today at UTC midnight. */
export function today(): Date {
  return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/** "Sep 14, 2026" */
export function formatDay(date: Date | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

/** "09/14" — for dense table columns. */
export function formatDayShort(date: Date | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC"
  }).format(date);
}

/** "Mon Sep 14" — for the calendar and day headers. */
export function formatDayWithWeekday(date: Date | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(date);
}

/** Strips the time, so comparisons are between calendar days. */
export function startOfDay(date: Date): Date {
  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

/** "in 3 days" / "today" / "12 days ago" */
export function relativeDay(date: Date | null | undefined, from = today()): string {
  if (!date) return "";
  // Timestamps carry a time of day; a record created this afternoon is still
  // "today" rather than "tomorrow".
  const diff = daysBetween(startOfDay(from), startOfDay(date));
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff > 0) return `in ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}
