import ExcelJS from "exceljs";
import { formatInvoiceDate, formatUiDateTime } from "@/lib/format/dates";
import type { InvoiceRegisterExportRow } from "./invoice-register-export-row";

const thin: Partial<ExcelJS.Border> = {
  style: "thin",
  color: { argb: "FFBBBBBB" },
};

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export async function buildInvoiceRegisterExcelBuffer(params: {
  rows: InvoiceRegisterExportRow[];
  totals: { net: number; vat: number; gross: number };
}): Promise<Buffer> {
  const { rows, totals } = params;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sales Ledger";
  const sheet = workbook.addWorksheet("Invoices", {});

  let r = 1;
  sheet.getCell(r, 1).value = "Sales invoice register";
  sheet.getCell(r, 1).font = { bold: true, size: 12 };
  r += 1;
  sheet.getCell(r, 1).value = `Generated ${formatUiDateTime(new Date())}`;
  r += 2;

  const head = [
    "Issue date",
    "Posted date",
    "Invoice no.",
    "Customer",
    "Site",
    "Status",
    "Net (£)",
    "VAT (£)",
    "Gross (£)",
    "PDF stored",
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

  for (const row of rows) {
    sheet.getCell(r, 1).value = formatInvoiceDate(row.issueDate);
    sheet.getCell(r, 2).value = row.postedAt ? formatInvoiceDate(row.postedAt) : "—";
    sheet.getCell(r, 3).value = row.invoiceNumber;
    sheet.getCell(r, 4).value = row.customerName || "—";
    sheet.getCell(r, 5).value = row.siteAddress?.trim() ? row.siteAddress : "—";
    sheet.getCell(r, 6).value = statusLabel(row.status);
    sheet.getCell(r, 7).value = row.amountNet;
    sheet.getCell(r, 7).numFmt = "#,##0.00";
    sheet.getCell(r, 8).value = row.amountVat;
    sheet.getCell(r, 8).numFmt = "#,##0.00";
    sheet.getCell(r, 9).value = row.amountGross;
    sheet.getCell(r, 9).numFmt = "#,##0.00";
    sheet.getCell(r, 10).value = row.hasPdf ? "Yes" : "No";
    for (let c = 1; c <= 10; c++) {
      sheet.getCell(r, c).border = { bottom: thin };
    }
    r += 1;
  }

  sheet.getCell(r, 6).value = "Total";
  sheet.getCell(r, 6).font = { bold: true };
  sheet.getCell(r, 7).value = totals.net;
  sheet.getCell(r, 7).numFmt = "#,##0.00";
  sheet.getCell(r, 8).value = totals.vat;
  sheet.getCell(r, 8).numFmt = "#,##0.00";
  sheet.getCell(r, 9).value = totals.gross;
  sheet.getCell(r, 9).numFmt = "#,##0.00";
  for (let c = 1; c <= 10; c++) {
    sheet.getCell(r, c).border = { top: thin, bottom: thin };
    sheet.getCell(r, c).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE4E4E7" },
    };
  }

  sheet.columns = [
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 28 },
    { width: 36 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
  ];

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
