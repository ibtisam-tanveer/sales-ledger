import { NextResponse } from "next/server";
import {
  contentDispositionHeader,
  statementAttachmentFilename,
} from "@/lib/format/download-filename";
import { buildStatementData } from "@/lib/statements/build-statement-data";
import { renderStatementPdfBuffer } from "@/lib/statement-pdf/render-statement";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ customerId: string }> }
) {
  try {
    const { customerId } = await ctx.params;
    const { searchParams } = new URL(req.url);
    const statementDateParam = searchParams.get("asOf");
    const statementDate = statementDateParam
      ? new Date(statementDateParam)
      : new Date();
    const mode = searchParams.get("mode");
    const inline = mode === "inline";

    const built = await buildStatementData(customerId, statementDate);
    if (!built.ok) {
      return NextResponse.json({ error: built.error }, { status: built.status });
    }

    const { customerName, customerAddress, company, statementDate: sd, rows } = built.data;

    const buffer = await renderStatementPdfBuffer({
      company,
      customerName,
      customerAddress,
      statementDate: sd,
      rows,
    });

    const filename = statementAttachmentFilename(customerName, sd, "pdf");
    const disposition = contentDispositionHeader(inline ? "inline" : "attachment", filename);

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": disposition,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
