import { v4 as uuidv4 } from "uuid";

/** Column mapping: Excel header text (row 1 of data region) → field. Match is case-insensitive, trimmed. */

export type InvoiceImportColumnKey =
  | "customerName"
  | "invoiceNumber"
  | "issueDate"
  | "dueDate"
  | "poNumber"
  | "siteAddress"
  | "amountNet"
  | "amountVat"
  | "amountGross"
  | "status";

export const INVOICE_IMPORT_COLUMN_KEYS: {
  key: InvoiceImportColumnKey;
  label: string;
  required: boolean;
}[] = [
  { key: "customerName", label: "Customer name", required: true },
  { key: "invoiceNumber", label: "Invoice number", required: true },
  { key: "issueDate", label: "Issue date", required: true },
  { key: "dueDate", label: "Due date", required: false },
  { key: "poNumber", label: "PO / order ref.", required: false },
  { key: "siteAddress", label: "Site / address", required: false },
  { key: "amountNet", label: "Net (£)", required: true },
  { key: "amountVat", label: "VAT (£)", required: true },
  { key: "amountGross", label: "Gross (£)", required: true },
  { key: "status", label: "Status", required: false },
];

export type InvoiceImportTemplate = {
  id: string;
  name: string;
  /** 1-based Excel row number for header labels */
  headerRow: number;
  /** For each field, the exact column header text to find in the header row */
  columns: Partial<Record<InvoiceImportColumnKey, string>>;
  /** Used when the Status column is missing or empty */
  defaultStatus: "draft" | "open" | "partially_paid" | "paid";
};

export function emptyImportTemplate(): InvoiceImportTemplate {
  return {
    id: uuidv4(),
    name: "New template",
    headerRow: 1,
    columns: {},
    defaultStatus: "draft",
  };
}
