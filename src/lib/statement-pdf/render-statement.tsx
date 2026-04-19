import { renderToBuffer } from "@react-pdf/renderer";
import {
  StatementPdfDocument,
  type CompanyHeader,
  type StatementRow,
} from "./statement-document";

export async function renderStatementPdfBuffer(params: {
  company: CompanyHeader;
  customerName: string;
  customerAddress: string;
  statementDate: Date;
  rows: StatementRow[];
}) {
  return renderToBuffer(
    <StatementPdfDocument
      company={params.company}
      customerName={params.customerName}
      customerAddress={params.customerAddress}
      statementDate={params.statementDate}
      rows={params.rows}
    />
  );
}
