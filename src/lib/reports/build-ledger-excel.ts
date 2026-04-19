import ExcelJS from "exceljs";
import { formatInvoiceDate, formatUiDate } from "@/lib/format/dates";
import { formatPounds } from "@/lib/format/money";
import type { LedgerLineWithRunning } from "@/lib/reports/ledger-compute";

const thin: Partial<ExcelJS.Border> = {
  style: "thin",
  color: { argb: "FFBBBBBB" },
};

export async function buildLedgerExcelBuffer(params: {
  customerName: string;
  lines: LedgerLineWithRunning[];
  from?: string;
  to?: string;
  openingGross?: number;
}): Promise<Buffer> {
  const { customerName, lines, from, to, openingGross } = params;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sales Ledger";
  const sheet = workbook.addWorksheet("Customer activity", {});

  let r = 1;
  sheet.getCell(r, 1).value = `Customer activity — ${customerName}`;
  sheet.getCell(r, 1).font = { bold: true, size: 12 };
  r += 1;
  if (from || to) {
    sheet.getCell(r, 1).value = `Date range: ${from ? formatUiDate(from) : "…"} to ${to ? formatUiDate(to) : "…"}`;
    r += 1;
  }
  if (from !== undefined && openingGross !== undefined) {
    sheet.getCell(r, 1).value = `Opening balance (before range): ${formatPounds(openingGross)}`;
    r += 1;
  }
  r += 1;

  const head = [
    "Date",
    "Type",
    "Ref",
    "Net (£)",
    "VAT (£)",
    "Gross / Pay (£)",
    "Running (£)",
  ];
  head.forEach((h, i) => {
    const c = sheet.getCell(r, i + 1);
    c.value = h;
    c.font = { bold: true };
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF4F4F5" },
    };
    c.border = { top: thin, bottom: thin, left: thin, right: thin };
  });
  r += 1;

  for (const line of lines) {
    if (line.kind === "invoice") {
      sheet.getCell(r, 1).value = formatInvoiceDate(line.date);
      sheet.getCell(r, 2).value = "invoice";
      sheet.getCell(r, 3).value = line.ref;
      sheet.getCell(r, 4).value = line.net;
      sheet.getCell(r, 4).numFmt = "#,##0.00";
      sheet.getCell(r, 5).value = line.vat;
      sheet.getCell(r, 5).numFmt = "#,##0.00";
      sheet.getCell(r, 6).value = line.gross;
      sheet.getCell(r, 6).numFmt = "#,##0.00";
      sheet.getCell(r, 7).value = line.runningGross;
      sheet.getCell(r, 7).numFmt = "#,##0.00";
    } else {
      sheet.getCell(r, 1).value = formatUiDate(line.date);
      sheet.getCell(r, 2).value = "payment";
      sheet.getCell(r, 3).value = line.ref;
      sheet.getCell(r, 6).value = -line.amount;
      sheet.getCell(r, 6).numFmt = "#,##0.00";
      sheet.getCell(r, 7).value = line.runningGross;
      sheet.getCell(r, 7).numFmt = "#,##0.00";
    }
    for (let c = 1; c <= 7; c++) {
      sheet.getCell(r, c).border = {
        bottom: thin,
        left: c === 1 ? thin : undefined,
        right: c === 7 ? thin : undefined,
      };
    }
    r += 1;
  }

  sheet.columns = [
    { width: 12 },
    { width: 10 },
    { width: 16 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
  ];

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
