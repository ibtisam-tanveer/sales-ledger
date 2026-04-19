export type LedgerCsvLine =
  | {
      kind: "invoice";
      date: string;
      ref: string;
      net: number;
      vat: number;
      gross: number;
      runningGross: number;
      invoiceId: string;
    }
  | {
      kind: "payment";
      date: string;
      ref: string;
      amount: number;
      runningGross: number;
    };

import { formatInvoiceDate, formatUiDate } from "@/lib/format/dates";

function escapeCsvCell(s: string): string {
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export type LedgerCsvOptions = {
  from?: string;
  to?: string;
  openingGross?: number;
};

/** UTF-8 BOM so Excel opens UTF-8 CSV correctly on Windows. */
export function buildLedgerCsv(
  customerName: string,
  lines: LedgerCsvLine[],
  formatMoney: (n: number) => string,
  opts?: LedgerCsvOptions
): string {
  const header = ["Date", "Type", "Ref", "Net (£)", "VAT (£)", "Gross / Pay (£)", "Running (£)"];
  const rows: string[][] = [header];
  for (const l of lines) {
    if (l.kind === "invoice") {
      rows.push([
        formatInvoiceDate(l.date),
        "invoice",
        l.ref,
        formatMoney(l.net),
        formatMoney(l.vat),
        formatMoney(l.gross),
        formatMoney(l.runningGross),
      ]);
    } else {
      rows.push([
        formatUiDate(l.date),
        "payment",
        l.ref,
        "",
        "",
        formatMoney(-l.amount),
        formatMoney(l.runningGross),
      ]);
    }
  }
  const body = rows
    .map((r) => r.map((c) => escapeCsvCell(c)).join(","))
    .join("\r\n");
  const meta: string[] = [`Customer activity — ${customerName}`];
  if (opts?.from || opts?.to) {
    meta.push(
      `Date range: ${opts.from?.length ? formatUiDate(opts.from) : "…"} to ${opts.to?.length ? formatUiDate(opts.to) : "…"}`
    );
  }
  if (opts?.from && opts?.openingGross !== undefined) {
    meta.push(`Opening balance (before range): ${formatMoney(opts.openingGross)}`);
  }
  return `\ufeff${meta.map((m) => escapeCsvCell(m)).join("\r\n")}\r\n\r\n${body}`;
}
