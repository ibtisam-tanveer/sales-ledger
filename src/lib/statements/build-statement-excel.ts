import fs from "fs";
import ExcelJS from "exceljs";
import { format } from "date-fns";
import { formatInvoiceDate, UI_DATE_PATTERN } from "@/lib/format/dates";
import { formatPounds } from "@/lib/format/money";
import type { CompanyHeader, StatementRow } from "@/lib/statement-pdf/statement-document";
import {
  computeStatementTotals,
  daysOverdue,
  formatOverdueDaysLabel,
} from "@/lib/statements/statement-math";

const thin: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFBBBBBB" } };

export async function buildStatementExcelBuffer(params: {
  company: CompanyHeader;
  customerName: string;
  customerAddress: string;
  statementDate: Date;
  rows: StatementRow[];
}): Promise<Buffer> {
  const { company, customerName, customerAddress, statementDate, rows } = params;
  const totals = computeStatementTotals(statementDate, rows);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sales Ledger";
  const sheet = workbook.addWorksheet("Statement", {
    pageSetup: { paperSize: 9, orientation: "portrait" },
  });

  sheet.columns = [
    { width: 11 },
    { width: 14 },
    { width: 12 },
    { width: 28 },
    { width: 11 },
    { width: 10 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
  ];

  let r = 1;
  if (company.logoPath) {
    try {
      if (fs.existsSync(company.logoPath)) {
        const lower = company.logoPath.toLowerCase();
        const extension = lower.endsWith(".png")
          ? "png"
          : lower.endsWith(".gif")
            ? "gif"
            : "jpeg";
        const imageId = workbook.addImage({
          filename: company.logoPath,
          extension,
        });
        sheet.addImage(imageId, {
          tl: { col: 0, row: 0 },
          ext: { width: 220, height: 80 },
        });
        r = 5;
      }
    } catch (e) {
      console.error("Statement Excel logo:", e);
    }
  }

  const titleRow = sheet.getCell(r, 1);
  titleRow.value = "Customer statement";
  titleRow.font = { bold: true, size: 14 };
  sheet.mergeCells(r, 1, r, 9);
  r += 2;

  const custBlock: string[] = [
    "Statement to",
    customerName,
    ...customerAddress.split("\n").filter((l) => l.trim()),
    "",
    "Statement",
    `Outstanding as at statement date (issued on/before; receipts received on/before) · Statement date ${format(statementDate, UI_DATE_PATTERN)}`,
  ];
  const coBlock: string[] = [
    company.legalName || "Company",
    ...(company.registeredAddress || "").split("\n"),
    `Company No. ${company.companyRegistrationNumber || "—"} · VAT No. ${company.vatNumber || "—"}`,
  ];
  const hdrRows = Math.max(custBlock.length, coBlock.length);
  for (let i = 0; i < hdrRows; i++) {
    const left = custBlock[i] ?? "";
    const right = coBlock[i] ?? "";
    sheet.getCell(r, 1).value = left;
    sheet.getCell(r, 1).alignment = { vertical: "top", wrapText: true };
    if (i === 0 || left === "Statement") {
      sheet.getCell(r, 1).font = { bold: true };
    }
    const rc = sheet.getCell(r, 6);
    rc.value = right;
    sheet.mergeCells(r, 6, r, 9);
    rc.alignment = { horizontal: "right", vertical: "top", wrapText: true };
    if (i === 0) rc.font = { bold: true, size: 11 };
    r++;
  }
  r += 1;

  const head = [
    "Date",
    "Invoice number",
    "PO number",
    "Site address",
    "Due date",
    "Days",
    "Amount",
    "Paid",
    "Balance",
  ];
  const headRow = sheet.getRow(r);
  head.forEach((h, i) => {
    const c = headRow.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, size: 9 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0F0" } };
    c.border = { top: thin, bottom: thin, left: thin, right: thin };
    c.alignment = { vertical: "middle", wrapText: true };
  });
  r++;

  for (const row of rows) {
    const od = daysOverdue(statementDate, row.dueDate);
    const vals = [
      formatInvoiceDate(row.issueDate),
      row.invoiceNumber,
      row.poNumber || "",
      row.siteAddress || "—",
      formatInvoiceDate(row.dueDate),
      formatOverdueDaysLabel(od),
      formatPounds(row.amountGross),
      row.paidGross > 0 ? formatPounds(row.paidGross) : "",
      formatPounds(row.balanceGross),
    ];
    const dataRow = sheet.getRow(r);
    vals.forEach((v, i) => {
      const c = dataRow.getCell(i + 1);
      c.value = v;
      c.border = { bottom: { style: "hair", color: { argb: "FFE0E0E0" } } };
      if (i >= 5) c.alignment = { horizontal: "right" };
      if (i === 3) c.alignment = { ...c.alignment, wrapText: true, vertical: "top" };
    });
    r++;
  }

  r += 1;

  const agingTitle = sheet.getCell(r, 1);
  agingTitle.value = "How long have I owed this money?";
  agingTitle.font = { bold: true, size: 9 };
  sheet.mergeCells(r, 1, r, 4);
  agingTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAEAEA" } };
  agingTitle.border = { top: thin, bottom: thin, left: thin, right: thin };
  agingTitle.alignment = { horizontal: "left", vertical: "middle" };

  const sumTitle = sheet.getCell(r, 6);
  sumTitle.value = "Summary";
  sumTitle.font = { bold: true, size: 10 };
  sheet.mergeCells(r, 6, r, 9);
  sumTitle.alignment = { horizontal: "right" };
  sumTitle.border = { bottom: thin };
  r++;

  const agingRows: [string, string][] = [
    ["1–30 days", formatPounds(totals.aging.b30)],
    ["31–60 days", formatPounds(totals.aging.b60)],
    ["61–90 days", formatPounds(totals.aging.b90)],
    ["91–120 days", formatPounds(totals.aging.b120)],
    ["121+ days", formatPounds(totals.aging.b121)],
  ];

  const addSummaryLine = (row: number, label: string, value: string) => {
    sheet.getCell(row, 6).value = label;
    sheet.getCell(row, 6).alignment = { horizontal: "right" };
    sheet.mergeCells(row, 6, row, 8);
    const vCell = sheet.getCell(row, 9);
    vCell.value = value;
    vCell.font = { bold: true };
    vCell.alignment = { horizontal: "right" };
  };

  addSummaryLine(r, "Total owed", formatPounds(totals.totalDue));
  const a0 = agingRows[0];
  sheet.getCell(r, 1).value = a0[0];
  sheet.mergeCells(r, 1, r, 3);
  sheet.getCell(r, 4).value = a0[1];
  sheet.getCell(r, 4).alignment = { horizontal: "right" };
  r++;

  addSummaryLine(r, "Total overdue", formatPounds(totals.totalOverdue));
  const a1 = agingRows[1];
  sheet.getCell(r, 1).value = a1[0];
  sheet.mergeCells(r, 1, r, 3);
  sheet.getCell(r, 4).value = a1[1];
  sheet.getCell(r, 4).alignment = { horizontal: "right" };
  r++;

  for (let i = 2; i < agingRows.length; i++) {
    const [lbl, val] = agingRows[i];
    sheet.getCell(r, 1).value = lbl;
    sheet.mergeCells(r, 1, r, 3);
    sheet.getCell(r, 4).value = val;
    sheet.getCell(r, 4).alignment = { horizontal: "right" };
    r++;
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
