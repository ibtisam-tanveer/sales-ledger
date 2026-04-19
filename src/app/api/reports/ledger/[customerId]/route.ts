import { NextResponse } from "next/server";
import { computeLedgerReport } from "@/lib/reports/ledger-compute";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ customerId: string }> }
) {
  try {
    const { customerId } = await ctx.params;
    const url = new URL(req.url);
    const fromKey = url.searchParams.get("from")?.trim() || null;
    const toKey = url.searchParams.get("to")?.trim() || null;
    const isoDate = /^\d{4}-\d{2}-\d{2}$/;
    if ((fromKey && !isoDate.test(fromKey)) || (toKey && !isoDate.test(toKey))) {
      return NextResponse.json(
        { error: "Invalid date: use YYYY-MM-DD for from and to." },
        { status: 400 }
      );
    }
    if (fromKey && toKey && fromKey > toKey) {
      return NextResponse.json(
        { error: "From date must be on or before to date." },
        { status: 400 }
      );
    }

    const { lines, openingGross, allocations } = await computeLedgerReport(
      customerId,
      { fromKey, toKey }
    );

    return NextResponse.json({
      lines,
      allocations,
      openingGross: fromKey ? openingGross : undefined,
      from: fromKey ?? undefined,
      to: toKey ?? undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
