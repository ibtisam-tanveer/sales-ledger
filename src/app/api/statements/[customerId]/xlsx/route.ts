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

    const file = await buildStatementFileBuffer(customerId, statementDate, "xlsx");
    if (!file.ok) {
      return NextResponse.json({ error: file.error }, { status: file.status });
    }

    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": contentDispositionHeader("attachment", file.filename),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
