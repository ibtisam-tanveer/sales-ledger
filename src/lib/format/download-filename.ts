import { format } from "date-fns";

/** Strip characters unsafe in file names on common OS / browsers. */
export function sanitizeFileComponent(s: string): string {
  return s
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function statementAttachmentFilename(
  customerName: string,
  asOf: Date,
  ext: "pdf" | "xlsx"
): string {
  const datePart = format(asOf, "yyyy-MM-dd");
  const base = sanitizeFileComponent(`${customerName} statement as of ${datePart}`);
  return `${base || `statement-${datePart}`}.${ext}`;
}

export function ledgerReportFilename(
  customerName: string,
  from?: string | null,
  to?: string | null,
  ext: "xlsx" | "pdf" = "xlsx"
): string {
  const range = [from, to].filter(Boolean).join(" to ") || "all-dates";
  const base = sanitizeFileComponent(`${customerName} activity ${range}`);
  return `${base || "customer-activity"}.${ext}`;
}

export function vatReportFilename(
  from?: string | null,
  to?: string | null,
  ext: "xlsx" | "pdf" = "xlsx"
): string {
  const range = [from, to].filter(Boolean).join(" to ") || "all-dates";
  const base = sanitizeFileComponent(`VAT report ${range}`);
  return `${base || "vat-report"}.${ext}`;
}

/** Content-Disposition header with ASCII fallback and UTF-8 filename*. */
export function contentDispositionHeader(
  disposition: "inline" | "attachment",
  filename: string
): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  const star = encodeURIComponent(filename);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${star}`;
}
