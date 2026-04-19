import { NextResponse } from "next/server";
import { buildStatementData } from "@/lib/statements/build-statement-data";

/** JSON for on-screen / preview (same figures as PDF & Excel). */
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
    return NextResponse.json(built.data, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
