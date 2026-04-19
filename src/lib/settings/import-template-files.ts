import ExcelJS from "exceljs";
import { INVOICE_IMPORT_COLUMN_KEYS } from "@/lib/company-settings/invoice-import-template";

/** Matches `/api/customers/import` column aliases after normalization. */
export function customersCsvTemplate(): string {
  const headers = ["Name", "Billing address", "External ref"];
  const example = ["Example Customer Ltd", "1 High Street, London", ""];
  const lines = [headers.join(","), example.join(",")];
  return "\ufeff" + lines.join("\r\n");
}

export function salesInvoicesCsvTemplate(): string {
  const headers = INVOICE_IMPORT_COLUMN_KEYS.map((c) => c.label);
  const empty = headers.map(() => "");
  const lines = [headers.join(","), empty.join(",")];
  return "\ufeff" + lines.join("\r\n");
}

export async function customersXlsxBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Customers");
  ws.addRow(["Name", "Billing address", "External ref"]);
  ws.addRow(["Example Customer Ltd", "1 High Street, London", ""]);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function salesInvoicesXlsxBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Invoices");
  const headers = INVOICE_IMPORT_COLUMN_KEYS.map((c) => c.label);
  ws.addRow(headers);
  ws.addRow(headers.map(() => ""));
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
