import { NextResponse } from "next/server";
import { listOpenInvoicesWithBalances } from "@/lib/invoices/open-for-allocation";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("customerId");
    if (!customerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 }
      );
    }
    const adjust = searchParams.get("adjustForRemittanceId");
    const rows = await listOpenInvoicesWithBalances(
      customerId,
      adjust ? { adjustForRemittanceId: adjust } : undefined
    );
    return NextResponse.json(rows);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
