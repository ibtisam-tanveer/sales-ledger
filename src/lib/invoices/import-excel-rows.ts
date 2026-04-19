import ExcelJS from "exceljs";
import { isValid, parse, parseISO } from "date-fns";
import type {
  InvoiceImportColumnKey,
  InvoiceImportTemplate,
} from "@/lib/company-settings/invoice-import-template";

export type ParsedInvoiceRow = {
  customerName: string;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date | null;
  poNumber: string;
  siteAddress: string;
  amountNet: number;
  amountVat: number;
  amountGross: number;
  status: "draft" | "open" | "partially_paid" | "paid";
  excelRow: number;
};

function normalizeHeader(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** First row wins if duplicate headers. */
function buildHeaderMap(
  worksheet: ExcelJS.Worksheet,
  headerRow: number
): Map<string, number> {
  const row = worksheet.getRow(headerRow);
  const map = new Map<string, number>();
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = String(cell.text ?? "").trim();
    if (!text) return;
    const k = normalizeHeader(text);
    if (!map.has(k)) map.set(k, colNumber);
  });
  return map;
}

function resolveColumn(
  headerMap: Map<string, number>,
  label: string | undefined
): number | null {
  if (!label?.trim()) return null;
  return headerMap.get(normalizeHeader(label)) ?? null;
}

function cellValue(cell: ExcelJS.Cell | undefined): unknown {
  if (!cell) return undefined;
  const v = cell.value;
  if (v && typeof v === "object" && "result" in v) {
    return (v as { result?: unknown }).result;
  }
  return v;
}

export function parseCellNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value ?? "")
    .trim()
    .replace(/[£,\s]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

export function parseCellDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = epoch.getTime() + value * 86400000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(value ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = parseISO(s.slice(0, 10));
    return isValid(d) ? d : null;
  }
  for (const fmt of ["dd/MM/yyyy", "d/M/yyyy", "dd.MM.yyyy", "d.M.yyyy"]) {
    const d = parse(s, fmt, new Date());
    if (isValid(d)) return d;
  }
  return null;
}

function readCell(
  worksheet: ExcelJS.Worksheet,
  rowIndex: number,
  col: number | null
): unknown {
  if (col == null) return undefined;
  const cell = worksheet.getRow(rowIndex).getCell(col);
  return cellValue(cell);
}

function parseStatus(
  raw: string | undefined,
  fallback: ParsedInvoiceRow["status"]
): ParsedInvoiceRow["status"] {
  const s = (raw ?? "").trim().toLowerCase();
  if (["draft", "open", "partially_paid", "paid"].includes(s)) {
    return s as ParsedInvoiceRow["status"];
  }
  if (s === "part paid" || s === "partial") return "partially_paid";
  return fallback;
}

export async function parseInvoiceExcelAsync(
  buffer: Buffer,
  template: InvoiceImportTemplate
): Promise<{ rows: ParsedInvoiceRow[]; errors: string[] }> {
  const errors: string[] = [];
  const required: InvoiceImportColumnKey[] = [
    "customerName",
    "invoiceNumber",
    "issueDate",
    "amountNet",
    "amountVat",
    "amountGross",
  ];
  for (const key of required) {
    const lab = template.columns[key]?.trim();
    if (!lab) {
      errors.push(`Template is missing column label for "${key}".`);
    }
  }
  if (errors.length > 0) return { rows: [], errors };

  const workbook = new ExcelJS.Workbook();
  // exceljs typings expect Node Buffer; runtime accepts Buffer / ArrayBuffer
  await workbook.xlsx.load(buffer as never);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { rows: [], errors: ["Workbook has no worksheets."] };
  }

  const headerRow = Math.max(1, Math.floor(template.headerRow));
  const headerMap = buildHeaderMap(sheet, headerRow);

  const col: Record<InvoiceImportColumnKey, number | null> = {
    customerName: resolveColumn(headerMap, template.columns.customerName),
    invoiceNumber: resolveColumn(headerMap, template.columns.invoiceNumber),
    issueDate: resolveColumn(headerMap, template.columns.issueDate),
    dueDate: resolveColumn(headerMap, template.columns.dueDate),
    poNumber: resolveColumn(headerMap, template.columns.poNumber),
    siteAddress: resolveColumn(headerMap, template.columns.siteAddress),
    amountNet: resolveColumn(headerMap, template.columns.amountNet),
    amountVat: resolveColumn(headerMap, template.columns.amountVat),
    amountGross: resolveColumn(headerMap, template.columns.amountGross),
    status: resolveColumn(headerMap, template.columns.status),
  };

  for (const key of required) {
    if (col[key] == null) {
      errors.push(
        `Could not find column header "${template.columns[key]?.trim()}" in row ${headerRow}.`
      );
    }
  }
  if (errors.length > 0) return { rows: [], errors };

  const rows: ParsedInvoiceRow[] = [];
  const lastRow = sheet.rowCount || headerRow;

  for (let r = headerRow + 1; r <= lastRow; r++) {
    const invNo = String(
      readCell(sheet, r, col.invoiceNumber) ?? ""
    ).trim();
    if (!invNo) continue;

    const customerName = String(
      readCell(sheet, r, col.customerName) ?? ""
    ).trim();
    if (!customerName) {
      errors.push(`Row ${r}: missing customer name.`);
      continue;
    }

    const issueDate = parseCellDate(readCell(sheet, r, col.issueDate));
    if (!issueDate) {
      errors.push(`Row ${r}: invalid or missing issue date.`);
      continue;
    }

    const amountNet = parseCellNumber(readCell(sheet, r, col.amountNet));
    const amountVat = parseCellNumber(readCell(sheet, r, col.amountVat));
    const amountGross = parseCellNumber(readCell(sheet, r, col.amountGross));
    if (!Number.isFinite(amountNet) || amountNet <= 0) {
      errors.push(`Row ${r}: invalid net amount.`);
      continue;
    }
    if (!Number.isFinite(amountVat) || amountVat < 0) {
      errors.push(`Row ${r}: invalid VAT amount.`);
      continue;
    }
    if (!Number.isFinite(amountGross) || amountGross <= 0) {
      errors.push(`Row ${r}: invalid gross amount.`);
      continue;
    }

    let dueDate: Date | null = null;
    if (col.dueDate != null) {
      dueDate = parseCellDate(readCell(sheet, r, col.dueDate));
    }

    const poNumber = String(readCell(sheet, r, col.poNumber) ?? "").trim();
    const siteAddress = String(readCell(sheet, r, col.siteAddress) ?? "").trim();
    const statusRaw =
      col.status != null
        ? String(readCell(sheet, r, col.status) ?? "").trim()
        : "";

    rows.push({
      customerName,
      invoiceNumber: invNo,
      issueDate,
      dueDate,
      poNumber,
      siteAddress,
      amountNet,
      amountVat,
      amountGross,
      status: parseStatus(statusRaw, template.defaultStatus),
      excelRow: r,
    });
  }

  return { rows, errors };
}
