import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db/connect";
import { Invoice } from "@/lib/models/invoice";
import { PaymentAllocation } from "@/lib/models/payment-allocation";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";
import { workspaceScopeOrLegacy } from "@/lib/workspace/workspace-scope";
import { roundMoney2 } from "@/lib/format/money";

export async function GET() {
  try {
    await connectDb();
    const workspaceId = requireWorkspaceObjectId();
    const scope = workspaceScopeOrLegacy(workspaceId);

    const invoiceTotals = await Invoice.aggregate<{
      _id: unknown;
      totalGross: number;
    }>([
      { $match: { status: { $ne: "draft" }, ...scope } },
      { $group: { _id: "$customerId", totalGross: { $sum: "$amountGross" } } },
    ]);

    const allocatedTotals = await PaymentAllocation.aggregate<{
      _id: unknown;
      totalAllocated: number;
    }>([
      { $match: { workspaceId } },
      {
        $lookup: {
          from: "invoices",
          localField: "invoiceId",
          foreignField: "_id",
          as: "inv",
        },
      },
      { $unwind: "$inv" },
      { $match: { "inv.status": { $ne: "draft" }, "inv.workspaceId": workspaceId } },
      { $group: { _id: "$inv.customerId", totalAllocated: { $sum: "$amountGross" } } },
    ]);

    const paidByCustomer = new Map<string, number>();
    for (const r of allocatedTotals) {
      paidByCustomer.set(String(r._id), Number(r.totalAllocated) || 0);
    }

    const balances: Record<string, number> = {};
    for (const row of invoiceTotals) {
      const id = String(row._id);
      const gross = Number(row.totalGross) || 0;
      const paid = paidByCustomer.get(id) ?? 0;
      balances[id] = roundMoney2(gross - paid);
    }

    return NextResponse.json({ balances });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

