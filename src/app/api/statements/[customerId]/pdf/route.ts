import { NextResponse } from "next/server";
import { contentDispositionHeader } from "@/lib/format/download-filename";
import { buildStatementFileBuffer } from "@/lib/statements/build-statement-file";

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

    const file = await buildStatementFileBuffer(customerId, statementDate, "pdf");
    if (!file.ok) {
      return NextResponse.json({ error: file.error }, { status: file.status });
    }

    const disposition = contentDispositionHeader(inline ? "inline" : "attachment", file.filename);

    return new NextResponse(new Uint8Array(file.buffer), {
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
