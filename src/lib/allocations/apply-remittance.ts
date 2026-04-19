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

export type { AllocationInput } from "@/lib/allocations/validate-allocations";

function isTransactionUnsupportedError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes("replica set") ||
    msg.includes("Transaction numbers") ||
    msg.includes("multi-document transactions")
  );
}

async function applyRemittanceSequential(params: {
  customerId: string;
  bankAccountKey: string;
  receivedAt: Date;
  amountGross: number;
  reference?: string;
  method?: string;
  allocations: AllocationInput[];
  unappliedAmount: number;
}) {
  const workspaceId = requireWorkspaceObjectId();
  const rem = await Remittance.create({
    workspaceId,
    customerId: params.customerId,
    bankAccountKey: params.bankAccountKey,
    receivedAt: params.receivedAt,
    amountGross: params.amountGross,
    reference: params.reference ?? "",
    method: params.method ?? "",
    unappliedAmount: params.unappliedAmount,
  });

  for (const a of params.allocations) {
    await PaymentAllocation.create({
      workspaceId,
      remittanceId: rem._id,
      invoiceId: a.invoiceId,
      amountGross: a.amountGross,
    });
  }

  // Cash book: one increment per new remittance (receipt total). Allocations below do not touch the bank.
  await BankAccount.updateOne(
    { workspaceId, singletonKey: params.bankAccountKey || "default" },
    { $inc: { balanceGross: params.amountGross } }
  );

  for (const a of params.allocations) {
    const inv = await Invoice.findOne({
      _id: a.invoiceId,
      ...workspaceScopeOrLegacy(workspaceId),
    });
    if (inv) {
      inv.status = await refreshInvoiceStatus(inv._id, inv.amountGross);
      await inv.save();
    }
  }

  return { remittanceId: rem._id.toString(), unappliedAmount: params.unappliedAmount };
}

export async function applyRemittance(params: {
  customerId: string;
  bankAccountKey?: string;
  receivedAt: Date;
  amountGross: number;
  reference?: string;
  method?: string;
  allocations: AllocationInput[];
}): Promise<{ remittanceId: string; unappliedAmount: number }> {
  await connectDb();
  await getBankAccount();
  const workspaceId = requireWorkspaceObjectId();
  const bankAccountKey = params.bankAccountKey || "default";

  await validateCustomerReceiptAllocations({
    customerId: params.customerId,
    amountGross: params.amountGross,
    allocations: params.allocations,
  });

  const allocSum = params.allocations.reduce((s, a) => s + a.amountGross, 0);
  const unappliedAmount = params.amountGross - allocSum;

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const [rem] = await Remittance.create(
      [
        {
          workspaceId,
          customerId: params.customerId,
          bankAccountKey,
          receivedAt: params.receivedAt,
          amountGross: params.amountGross,
          reference: params.reference ?? "",
          method: params.method ?? "",
          unappliedAmount,
        },
      ],
      { session }
    );

    for (const a of params.allocations) {
      await PaymentAllocation.create(
        [
          {
            workspaceId,
            remittanceId: rem._id,
            invoiceId: a.invoiceId,
            amountGross: a.amountGross,
          },
        ],
        { session }
      );
    }
    // Cash book: one increment per new remittance (receipt total).
    await BankAccount.updateOne(
      { workspaceId, singletonKey: bankAccountKey },
      { $inc: { balanceGross: params.amountGross } }
    ).session(session);
    await session.commitTransaction();
    session.endSession();

    for (const a of params.allocations) {
      const inv = await Invoice.findOne({
      _id: a.invoiceId,
      ...workspaceScopeOrLegacy(workspaceId),
    });
      if (inv) {
        inv.status = await refreshInvoiceStatus(inv._id, inv.amountGross);
        await inv.save();
      }
    }

    return { remittanceId: rem._id.toString(), unappliedAmount };
  } catch (e) {
    await session.abortTransaction().catch(() => {});
    session.endSession();
    if (isTransactionUnsupportedError(e)) {
      return applyRemittanceSequential({
        ...params,
        bankAccountKey,
        unappliedAmount,
      });
    }
    throw e;
  }
}
