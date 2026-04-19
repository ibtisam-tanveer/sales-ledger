import mongoose, { type Types } from "mongoose";
import { connectDb } from "@/lib/db/connect";
import { PaymentAllocation } from "@/lib/models/payment-allocation";
import { Remittance } from "@/lib/models/remittance";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";

export async function getTotalAllocatedForInvoice(
  invoiceId: Types.ObjectId | string
): Promise<number> {
  await connectDb();
  const workspaceId = requireWorkspaceObjectId();
  const agg = await PaymentAllocation.aggregate([
    { $match: { workspaceId, invoiceId } },
    { $group: { _id: null, t: { $sum: "$amountGross" } } },
  ]);
  return agg[0]?.t ?? 0;
}

/** Sum allocations from remittances received on or before `asOfEnd` (statement / historical balance). */
export async function getTotalAllocatedForInvoiceUpTo(
  invoiceId: Types.ObjectId | string,
  asOfEnd: Date
): Promise<number> {
  await connectDb();
  const workspaceId = requireWorkspaceObjectId();
  const iid =
    typeof invoiceId === "string"
      ? new mongoose.Types.ObjectId(invoiceId)
      : invoiceId;
  const remColl = Remittance.collection.name;
  const agg = await PaymentAllocation.aggregate([
    { $match: { workspaceId, invoiceId: iid } },
    {
      $lookup: {
        from: remColl,
        localField: "remittanceId",
        foreignField: "_id",
        as: "rem",
      },
    },
    { $unwind: "$rem" },
    { $match: { "rem.receivedAt": { $lte: asOfEnd } } },
    { $group: { _id: null, t: { $sum: "$amountGross" } } },
  ]);
  return agg[0]?.t ?? 0;
}

export async function refreshInvoiceStatus(
  invoiceId: Types.ObjectId | string,
  amountGross: number
): Promise<"open" | "partially_paid" | "paid"> {
  const paid = await getTotalAllocatedForInvoice(invoiceId);
  if (paid <= 0) return "open";
  if (paid + 0.001 >= amountGross) return "paid";
  return "partially_paid";
}
