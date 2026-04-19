import { renderToBuffer } from "@react-pdf/renderer";
import { VatPdfDocument } from "./vat-document";
import type { VatReportRow } from "@/lib/reports/vat-report";

export async function renderVatPdfBuffer(params: {
  from?: string;
  to?: string;
  totalsOnly: boolean;
  rows: VatReportRow[];
  totals: { net: number; vat: number; gross: number };
}) {
  return renderToBuffer(
    <VatPdfDocument
      from={params.from}
      to={params.to}
      totalsOnly={params.totalsOnly}
      rows={params.rows}
      totals={params.totals}
    />
  );
}

