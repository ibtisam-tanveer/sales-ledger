import { formatInvoiceDate, formatUiDate } from "@/lib/format/dates";
import { formatPounds } from "@/lib/format/money";
import type { VatReportRow } from "@/lib/reports/vat-report";

function escapeCsvCell(s: string): string {
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildVatCsv(
  rows: VatReportRow[],
  totals: { net: number; vat: number; gross: number },
  opts: { from?: string; to?: string; totalsOnly: boolean }
): string {
  const meta: string[] = ["VAT summary / return data"];
  meta.push(
    `Date range: ${opts.from?.length ? formatUiDate(opts.from) : "…"} to ${opts.to?.length ? formatUiDate(opts.to) : "…"}`
  );
  meta.push(opts.totalsOnly ? "Totals only (summary)" : "Invoice detail");
  const header = ["Date", "Invoice", "Net (£)", "VAT (£)", "Gross (£)"];
  const linesOut: string[][] = [header];
  const displayRows = opts.totalsOnly ? [] : rows;
  for (const r of displayRows) {
    linesOut.push([
      formatInvoiceDate(r.issueDate),
      r.invoiceNumber,
      formatPounds(r.amountNet),
      formatPounds(r.amountVat),
      formatPounds(r.amountGross),
    ]);
  }
  linesOut.push([
    "",
    "Total",
    formatPounds(totals.net),
    formatPounds(totals.vat),
    formatPounds(totals.gross),
  ]);
  const body = linesOut
    .map((r) => r.map((c) => escapeCsvCell(c)).join(","))
    .join("\r\n");
  return `\ufeff${meta.map((m) => escapeCsvCell(m)).join("\r\n")}\r\n\r\n${body}`;
}
