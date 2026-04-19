import { NextResponse } from "next/server";
import { queryVatReport } from "@/lib/reports/vat-report";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const customerId = searchParams.get("customerId");
    const totalsOnly =
      searchParams.get("totalsOnly") === "1" ||
      searchParams.get("totalsOnly") === "true";

    const { rows, totals } = await queryVatReport({ from, to, customerId });

    return NextResponse.json({
      totals,
      rows: totalsOnly ? [] : rows,
      totalsOnly,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
