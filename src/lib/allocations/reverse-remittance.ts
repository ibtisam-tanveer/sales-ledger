import mongoose from "mongoose";
import { getBankAccount } from "@/lib/bank-account/service";
import { connectDb } from "@/lib/db/connect";
import { BankAccount } from "@/lib/models/bank-account";
import { Invoice } from "@/lib/models/invoice";
import { PaymentAllocation } from "@/lib/models/payment-allocation";
import { Remittance } from "@/lib/models/remittance";
import { refreshInvoiceStatus } from "@/lib/invoices/allocated-sum";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";
import { workspaceScopeOrLegacy } from "@/lib/workspace/workspace-scope";

function isTransactionUnsupportedError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes("replica set") ||
    msg.includes("Transaction numbers") ||
    msg.includes("multi-document transactions")
  );
}

async function reverseRemittanceSequential(
  workspaceId: mongoose.Types.ObjectId,
  rem: {
    _id: mongoose.Types.ObjectId;
    bankAccountKey?: string;
    amountGross: number;
  }
): Promise<void> {
  const rid = rem._id;
  await PaymentAllocation.deleteMany({ remittanceId: rid });
  await BankAccount.updateOne(
    { workspaceId, singletonKey: rem.bankAccountKey || "default" },
    { $inc: { balanceGross: -rem.amountGross } }
  );
  await Remittance.deleteOne({ _id: rid });
}

/** Removes payment allocations and the remittance; bank balance and invoice statuses are updated. */
export async function reverseRemittance(remittanceId: string): Promise<void> {
  await connectDb();
  await getBankAccount();
  const workspaceId = requireWorkspaceObjectId();
  const rid = new mongoose.Types.ObjectId(remittanceId);
  const rem = await Remittance.findOne({ _id: rid, workspaceId });
  if (!rem) throw new Error("Remittance not found");

  const allocs = await PaymentAllocation.find({ remittanceId: rid }).lean();
  const invoiceIds = [...new Set(allocs.map((a) => a.invoiceId.toString()))];

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    await PaymentAllocation.deleteMany({ remittanceId: rid }).session(session);
    await BankAccount.updateOne(
      { workspaceId, singletonKey: rem.bankAccountKey || "default" },
      { $inc: { balanceGross: -rem.amountGross } }
    ).session(session);
    await Remittance.deleteOne({ _id: rid }).session(session);
    await session.commitTransaction();
    session.endSession();
  } catch (e) {
    await session.abortTransaction().catch(() => {});
    session.endSession();
    if (isTransactionUnsupportedError(e)) {
      await reverseRemittanceSequential(workspaceId, rem);
    } else {
      throw e;
    }
  }

  for (const iid of invoiceIds) {
    const inv = await Invoice.findOne({
      _id: iid,
      ...workspaceScopeOrLegacy(workspaceId),
    });
    if (inv) {
      inv.status = await refreshInvoiceStatus(inv._id, inv.amountGross);
      await inv.save();
    }
  }
}
