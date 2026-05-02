import { NextResponse } from "next/server";
import { listCustomersWithNonZeroStatementAsOf } from "@/lib/statements/list-customers-with-statement-balance";

/** Customers who would receive a bulk statement (non-zero balance as at date). */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const asOfParam = searchParams.get("asOf");
    const asOf = asOfParam ? new Date(asOfParam) : new Date();
    const customers = await listCustomersWithNonZeroStatementAsOf(asOf);
    return NextResponse.json(
      { customers },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
