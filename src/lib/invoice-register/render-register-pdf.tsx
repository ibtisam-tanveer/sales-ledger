import { renderToBuffer } from "@react-pdf/renderer";
import type { InvoiceRegisterExportRow } from "./invoice-register-export-row";
import { InvoiceRegisterPdfDocument } from "./register-pdf-document";

export async function renderInvoiceRegisterPdfBuffer(params: {
  rows: InvoiceRegisterExportRow[];
  totals: { net: number; vat: number; gross: number };
}) {
  return renderToBuffer(
    <InvoiceRegisterPdfDocument rows={params.rows} totals={params.totals} />
  );
}
