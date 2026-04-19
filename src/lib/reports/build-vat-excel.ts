import ExcelJS from "exceljs";
import { formatInvoiceDate, formatUiDate } from "@/lib/format/dates";
import type { VatReportRow } from "@/lib/reports/vat-report";

const thin: Partial<ExcelJS.Border> = {
  style: "thin",
  color: { argb: "FFBBBBBB" },
};

export async function buildVatExcelBuffer(params: {
  rows: VatReportRow[];
  totals: { net: number; vat: number; gross: number };
  from?: string;
  to?: string;
  totalsOnly: boolean;
}): Promise<Buffer> {
  const { rows, totals, from, to, totalsOnly } = params;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sales Ledger";
  const sheet = workbook.addWorksheet("VAT", {});

  let r = 1;
  sheet.getCell(r, 1).value = "VAT summary / return data";
  sheet.getCell(r, 1).font = { bold: true, size: 12 };
  r += 1;
  sheet.getCell(r, 1).value = `Date range: ${from?.length ? formatUiDate(from) : "…"} to ${to?.length ? formatUiDate(to) : "…"}`;
  r += 1;
  sheet.getCell(r, 1).value = totalsOnly
    ? "Totals only (summary)"
    : "Invoice detail";
  r += 2;

  const head = ["Date", "Invoice", "Net (£)", "VAT (£)", "Gross (£)"];
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

  const displayRows = totalsOnly ? [] : rows;
  for (const row of displayRows) {
    sheet.getCell(r, 1).value = formatInvoiceDate(row.issueDate);
    sheet.getCell(r, 2).value = row.invoiceNumber;
    sheet.getCell(r, 3).value = row.amountNet;
    sheet.getCell(r, 3).numFmt = "#,##0.00";
    sheet.getCell(r, 4).value = row.amountVat;
    sheet.getCell(r, 4).numFmt = "#,##0.00";
    sheet.getCell(r, 5).value = row.amountGross;
    sheet.getCell(r, 5).numFmt = "#,##0.00";
    for (let c = 1; c <= 5; c++) {
      sheet.getCell(r, c).border = { bottom: thin };
    }
    r += 1;
  }

  sheet.getCell(r, 2).value = "Total";
  sheet.getCell(r, 2).font = { bold: true };
  sheet.getCell(r, 3).value = totals.net;
  sheet.getCell(r, 3).numFmt = "#,##0.00";
  sheet.getCell(r, 4).value = totals.vat;
  sheet.getCell(r, 4).numFmt = "#,##0.00";
  sheet.getCell(r, 5).value = totals.gross;
  sheet.getCell(r, 5).numFmt = "#,##0.00";
  for (let c = 1; c <= 5; c++) {
    sheet.getCell(r, c).border = { top: thin, bottom: thin };
    sheet.getCell(r, c).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE4E4E7" },
    };
  }

  sheet.columns = [{ width: 12 }, { width: 16 }, { width: 12 }, { width: 12 }, { width: 12 }];

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
