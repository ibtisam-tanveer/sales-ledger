import mongoose from "mongoose";
import { getBankAccount } from "@/lib/bank-account/service";
import { connectDb } from "@/lib/db/connect";
import {
  validateCustomerReceiptAllocations,
  type AllocationInput,
} from "@/lib/allocations/validate-allocations";
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

export async function replaceRemittance(
  remittanceId: string,
  params: {
    receivedAt: Date;
    amountGross: number;
    reference?: string;
    method?: string;
    bankAccountKey?: string;
    allocations: AllocationInput[];
  }
): Promise<{ unappliedAmount: number }> {
  await connectDb();
  await getBankAccount();
  const workspaceId = requireWorkspaceObjectId();
  const rid = new mongoose.Types.ObjectId(remittanceId);
  const rem = await Remittance.findOne({ _id: rid, workspaceId });
  if (!rem) throw new Error("Remittance not found");
  const customerId = rem.customerId.toString();

  await validateCustomerReceiptAllocations({
    customerId,
    amountGross: params.amountGross,
    allocations: params.allocations,
    excludeRemittanceId: remittanceId,
  });

  const oldAllocs = await PaymentAllocation.find({ remittanceId: rid }).lean();
  const oldInvoiceIds = oldAllocs.map((a) => a.invoiceId.toString());
  const newInvoiceIds = params.allocations.map((a) => a.invoiceId);
  const bankAccountKey = params.bankAccountKey || "default";
  const unappliedAmount =
    params.amountGross -
    params.allocations.reduce((s, a) => s + a.amountGross, 0);

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    await PaymentAllocation.deleteMany({ remittanceId: rid }).session(session);

    const oldKey = rem.bankAccountKey || "default";
    const oldAmount = rem.amountGross;
    // Cash book: adjust bank by the change in receipt total only — not by allocation lines.
    if (oldKey === bankAccountKey) {
      await BankAccount.updateOne(
        { workspaceId, singletonKey: oldKey },
        { $inc: { balanceGross: params.amountGross - oldAmount } }
      ).session(session);
    } else {
      await BankAccount.updateOne(
        { workspaceId, singletonKey: oldKey },
        { $inc: { balanceGross: -oldAmount } }
      ).session(session);
      await BankAccount.updateOne(
        { workspaceId, singletonKey: bankAccountKey },
        { $inc: { balanceGross: params.amountGross } }
      ).session(session);
    }

    await Remittance.updateOne(
      { _id: rid },
      {
        $set: {
          receivedAt: params.receivedAt,
          amountGross: params.amountGross,
          reference: params.reference ?? "",
          method: params.method ?? "",
          bankAccountKey,
          unappliedAmount,
        },
      }
    ).session(session);

    for (const a of params.allocations) {
      await PaymentAllocation.create(
        [
          {
            workspaceId,
            remittanceId: rid,
            invoiceId: a.invoiceId,
            amountGross: a.amountGross,
          },
        ],
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();
  } catch (e) {
    await session.abortTransaction().catch(() => {});
    session.endSession();
    if (isTransactionUnsupportedError(e)) {
      await replaceRemittanceSequential({
        workspaceId,
        rid,
        oldKey: rem.bankAccountKey || "default",
        oldAmount: rem.amountGross,
        bankAccountKey,
        unappliedAmount,
        params,
      });
    } else {
      throw e;
    }
  }

  const affected = new Set([...oldInvoiceIds, ...newInvoiceIds]);
  for (const iid of affected) {
    const inv = await Invoice.findOne({
      _id: iid,
      ...workspaceScopeOrLegacy(workspaceId),
    });
    if (inv) {
      inv.status = await refreshInvoiceStatus(inv._id, inv.amountGross);
      await inv.save();
    }
  }

  return { unappliedAmount };
}

async function replaceRemittanceSequential(ctx: {
  workspaceId: mongoose.Types.ObjectId;
  rid: mongoose.Types.ObjectId;
  oldKey: string;
  oldAmount: number;
  bankAccountKey: string;
  unappliedAmount: number;
  params: {
    receivedAt: Date;
    amountGross: number;
    reference?: string;
    method?: string;
    allocations: AllocationInput[];
  };
}): Promise<void> {
  const {
    workspaceId,
    rid,
    oldKey,
    oldAmount,
    bankAccountKey,
    unappliedAmount,
    params,
  } = ctx;
  await PaymentAllocation.deleteMany({ remittanceId: rid });

  // Cash book: delta on receipt total only (same as transactional path).
  if (oldKey === bankAccountKey) {
    await BankAccount.updateOne(
      { workspaceId, singletonKey: oldKey },
      { $inc: { balanceGross: params.amountGross - oldAmount } }
    );
  } else {
    await BankAccount.updateOne(
      { workspaceId, singletonKey: oldKey },
      { $inc: { balanceGross: -oldAmount } }
    );
    await BankAccount.updateOne(
      { workspaceId, singletonKey: bankAccountKey },
      { $inc: { balanceGross: params.amountGross } }
    );
  }

  await Remittance.updateOne(
    { _id: rid },
    {
      $set: {
        receivedAt: params.receivedAt,
        amountGross: params.amountGross,
        reference: params.reference ?? "",
        method: params.method ?? "",
        bankAccountKey,
        unappliedAmount,
      },
    }
  );

  for (const a of params.allocations) {
    await PaymentAllocation.create({
      workspaceId,
      remittanceId: rid,
      invoiceId: a.invoiceId,
      amountGross: a.amountGross,
    });
  }
}
