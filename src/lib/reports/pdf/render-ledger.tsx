import { renderToBuffer } from "@react-pdf/renderer";
import { LedgerPdfDocument } from "./ledger-document";
import type { LedgerLineWithRunning } from "@/lib/reports/ledger-compute";

export async function renderLedgerPdfBuffer(params: {
  customerName: string;
  from?: string;
  to?: string;
  openingGross?: number;
  lines: LedgerLineWithRunning[];
}) {
  return renderToBuffer(
    <LedgerPdfDocument
      customerName={params.customerName}
      from={params.from}
      to={params.to}
      openingGross={params.openingGross}
      lines={params.lines}
    />
  );
}

