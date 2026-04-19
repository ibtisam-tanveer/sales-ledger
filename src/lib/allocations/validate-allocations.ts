import mongoose from "mongoose";
import { connectDb } from "@/lib/db/connect";
import { Invoice } from "@/lib/models/invoice";
import { PaymentAllocation } from "@/lib/models/payment-allocation";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";
import { workspaceScopeOrLegacy } from "@/lib/workspace/workspace-scope";

export type AllocationInput = { invoiceId: string; amountGross: number };

export async function validateCustomerReceiptAllocations(params: {
  customerId: string;
  amountGross: number;
  allocations: AllocationInput[];
  excludeRemittanceId?: string;
}): Promise<void> {
  await connectDb();
  const workspaceId = requireWorkspaceObjectId();
  const { customerId, amountGross, allocations, excludeRemittanceId } = params;
  const allocSum = allocations.reduce((s, a) => s + a.amountGross, 0);
  if (allocSum > amountGross + 0.01) {
    throw new Error("Allocations exceed remittance amount ");
  }

  const excludeOid = excludeRemittanceId
    ? new mongoose.Types.ObjectId(excludeRemittanceId)
    : undefined;

  for (const a of allocations) {
    const inv = await Invoice.findOne({
      _id: a.invoiceId,
      ...workspaceScopeOrLegacy(workspaceId),
    });
    if (!inv || inv.customerId.toString() !== customerId) {
      throw new Error("Invalid invoice for customer");
    }
    if (inv.status === "draft") {
      throw new Error("Cannot allocate to draft invoice");
    }
    const pipeline: mongoose.PipelineStage[] = [
      { $match: { workspaceId, invoiceId: inv._id } },
    ];
    if (excludeOid) {
      pipeline.push({ $match: { remittanceId: { $ne: excludeOid } } });
    }
    pipeline.push({ $group: { _id: null, t: { $sum: "$amountGross" } } });
    const existing = await PaymentAllocation.aggregate<{ t?: number }>(pipeline);
    const already = existing[0]?.t ?? 0;
    const balance = inv.amountGross - already;
    if (a.amountGross > balance + 0.01) {
      throw new Error(`Over-allocation on invoice ${inv.invoiceNumber}`);
    }
  }
}
