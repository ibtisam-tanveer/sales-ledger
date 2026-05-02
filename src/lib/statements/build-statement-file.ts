import { statementAttachmentFilename } from "@/lib/format/download-filename";
import { renderStatementPdfBuffer } from "@/lib/statement-pdf/render-statement";
import { buildStatementData } from "./build-statement-data";
import { buildStatementExcelBuffer } from "./build-statement-excel";

export async function buildStatementFileBuffer(
  customerId: string,
  statementDate: Date,
  format: "pdf" | "xlsx"
): Promise<
  | { ok: true; filename: string; buffer: Buffer }
  | { ok: false; error: string; status: number }
> {
  const built = await buildStatementData(customerId, statementDate);
  if (!built.ok) {
    return { ok: false, error: built.error, status: built.status };
  }
  const { customerName, customerAddress, company, statementDate: sd, rows } = built.data;

  if (format === "pdf") {
    const buffer = await renderStatementPdfBuffer({
      company,
      customerName,
      customerAddress,
      statementDate: sd,
      rows,
    });
    const filename = statementAttachmentFilename(customerName, sd, "pdf");
    return { ok: true, filename, buffer: Buffer.from(buffer) };
  }

  const buffer = await buildStatementExcelBuffer({
    company,
    customerName,
    customerAddress,
    statementDate: sd,
    rows,
  });
  const filename = statementAttachmentFilename(customerName, sd, "xlsx");
  return { ok: true, filename, buffer };
}
