/**
 * Operator time inputs are authored in Asia/Kolkata (IST).
 *
 * The CMS stores absolute ISO instants. Every editor must convert through these
 * helpers so a wall-clock value means the same thing in the banner studio, the
 * layout editor and the generic content editor. Kolkata is a fixed +05:30
 * offset, so the conversion is exact without DST handling.
 */

export const IST_TIMEZONE = "Asia/Kolkata";

export function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Stored ISO instant → the `datetime-local` value an operator sees, in IST. */
export function toIstInputValue(value: unknown): string {
  const date = parseDate(value);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${read("year")}-${read("month")}-${read("day")}T${read("hour")}:${read("minute")}`;
}

/** An operator's IST wall-clock input → an absolute ISO instant. */
export function fromIstInputValue(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(`${value}:00+05:30`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
