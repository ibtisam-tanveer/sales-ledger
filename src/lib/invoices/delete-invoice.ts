import mongoose from "mongoose";
import { connectDb } from "@/lib/db/connect";
import { Invoice } from "@/lib/models/invoice";
import { PaymentAllocation } from "@/lib/models/payment-allocation";
import { Remittance } from "@/lib/models/remittance";
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

async function runDeleteWithoutTransaction(ctx: {
  workspaceId: mongoose.Types.ObjectId;
  invoiceObjectId: mongoose.Types.ObjectId;
}) {
  const { workspaceId, invoiceObjectId } = ctx;
  const allocs = await PaymentAllocation.find({
    invoiceId: invoiceObjectId,
    ...workspaceScopeOrLegacy(workspaceId),
  }).lean();

  const byRemittance = new Map<string, number>();
  for (const a of allocs) {
    const rid = String(a.remittanceId);
    const amt = Number(a.amountGross) || 0;
    byRemittance.set(rid, (byRemittance.get(rid) ?? 0) + amt);
  }

  if (allocs.length > 0) {
    await PaymentAllocation.deleteMany({
      invoiceId: invoiceObjectId,
      ...workspaceScopeOrLegacy(workspaceId),
    });
    for (const [rid, sum] of byRemittance.entries()) {
      if (!sum || sum <= 0) continue;
      await Remittance.updateOne(
        { _id: rid, ...workspaceScopeOrLegacy(workspaceId) },
        { $inc: { unappliedAmount: sum } }
      );
    }
  }

  await Invoice.deleteOne({
    _id: invoiceObjectId,
    ...workspaceScopeOrLegacy(workspaceId),
  });
}

export async function deleteInvoiceAndUnallocatePayments(params: {
  invoiceId: string;
  /** Deleting non-draft invoices is destructive; require explicit force from UI. */
  force?: boolean;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  await connectDb();
  const workspaceId = requireWorkspaceObjectId();

  const inv = await Invoice.findOne({
    _id: params.invoiceId,
    ...workspaceScopeOrLegacy(workspaceId),
  }).lean();
  if (!inv) return { ok: false, status: 404, error: "Not found" };

  const status = String((inv as { status?: unknown }).status ?? "");
  const isDraft = status === "draft";
  if (!isDraft && params.force !== true) {
    return {
      ok: false,
      status: 400,
      error: "Refusing to delete a posted invoice without force=true",
    };
  }

  // Remove allocations to this invoice and return that cash to the remittance's unappliedAmount.
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const allocs = await PaymentAllocation.find({
      invoiceId: inv._id,
      ...workspaceScopeOrLegacy(workspaceId),
    })
      .session(session)
      .lean();

    const byRemittance = new Map<string, number>();
    for (const a of allocs) {
      const rid = String(a.remittanceId);
      const amt = Number(a.amountGross) || 0;
      byRemittance.set(rid, (byRemittance.get(rid) ?? 0) + amt);
    }

    if (allocs.length > 0) {
      await PaymentAllocation.deleteMany({
        invoiceId: inv._id,
        ...workspaceScopeOrLegacy(workspaceId),
      }).session(session);

      for (const [rid, sum] of byRemittance.entries()) {
        if (!sum || sum <= 0) continue;
        await Remittance.updateOne(
          { _id: rid, ...workspaceScopeOrLegacy(workspaceId) },
          { $inc: { unappliedAmount: sum } }
        ).session(session);
      }
    }

    await Invoice.deleteOne({
      _id: inv._id,
      ...workspaceScopeOrLegacy(workspaceId),
    }).session(session);

    await session.commitTransaction();
    session.endSession();
    return { ok: true };
  } catch (e) {
    await session.abortTransaction().catch(() => {});
    session.endSession();
    if (isTransactionUnsupportedError(e)) {
      try {
        await runDeleteWithoutTransaction({
          workspaceId,
          invoiceObjectId: inv._id,
        });
        return { ok: true };
      } catch (e2) {
        const msg2 = e2 instanceof Error ? e2.message : "Error";
        return { ok: false, status: 500, error: msg2 };
      }
    }
    const msg = e instanceof Error ? e.message : "Error";
    return { ok: false, status: 500, error: msg };
  }
}

