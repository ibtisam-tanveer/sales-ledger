import { format, isValid, parse, parseISO } from "date-fns";

/** Standard calendar date display across the app: 18.04.2026 */
export const UI_DATE_PATTERN = "dd.MM.yyyy";

/**
 * Parse invoice issue/due dates from API or PATCH body into a stored Date.
 * YYYY-MM-DD is stored as UTC midnight for that calendar day so list, statements
 * and PDFs agree after edits.
 */
export function coerceInvoiceCalendarDate(value: unknown): Date | undefined {
  if (value == null || value === "") return undefined;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? undefined : value;
  }
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  const ymd = t.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [ys, ms, ds] = ymd.split("-");
    const y = Number(ys);
    const mo = Number(ms);
    const d = Number(ds);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return undefined;
    return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
  }
  const parsed = parseISO(t);
  return isValid(parsed) ? parsed : undefined;
}

/**
 * Calendar date in **Europe/London** (UK trading date). Matches supplier PDFs and avoids
 * “off by one day” when the DB instant is UTC but the invoice is dated in local time.
 */
export function formatInvoiceDate(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "—";
  const d = value instanceof Date ? value : parseISO(String(value).trim());
  if (!isValid(d)) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  if (!day || !month || !year) return "—";
  return `${day}.${month}.${year}`;
}

/** YYYY-MM-DD in Europe/London — for ledger / report date filters. */
export function invoiceCalendarDayKeyLondon(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : parseISO(String(value).trim());
  if (!isValid(d)) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function formatUiDate(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "—";
  if (value instanceof Date) {
    return isValid(value) ? format(value, UI_DATE_PATTERN) : "—";
  }
  const s = value.trim();
  if (!s) return "—";
  // ISO datetimes from JSON — use full instant (avoid slicing to YYYY-MM-DD, which breaks timezones)
  if (s.includes("T")) {
    const parsed = parseISO(s);
    return isValid(parsed) ? format(parsed, UI_DATE_PATTERN) : s;
  }
  const ymd = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const d = parse(ymd, "yyyy-MM-dd", new Date());
    return isValid(d) ? format(d, UI_DATE_PATTERN) : ymd;
  }
  const parsed = parseISO(s);
  return isValid(parsed) ? format(parsed, UI_DATE_PATTERN) : s;
}

/** For generated timestamps (e.g. PDF footer). */
export function formatUiDateTime(value: Date | number): string {
  return format(value, `${UI_DATE_PATTERN} HH:mm`);
}
