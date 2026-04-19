import { NextResponse } from "next/server";
import {
  contentDispositionHeader,
  statementAttachmentFilename,
} from "@/lib/format/download-filename";
import { buildStatementData } from "@/lib/statements/build-statement-data";
import { buildStatementExcelBuffer } from "@/lib/statements/build-statement-excel";

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

    const built = await buildStatementData(customerId, statementDate);
    if (!built.ok) {
      return NextResponse.json({ error: built.error }, { status: built.status });
    }

    const { customerName, customerAddress, company, statementDate: sd, rows } = built.data;

    const buffer = await buildStatementExcelBuffer({
      company,
      customerName,
      customerAddress,
      statementDate: sd,
      rows,
    });

    const filename = statementAttachmentFilename(customerName, sd, "xlsx");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": contentDispositionHeader("attachment", filename),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
