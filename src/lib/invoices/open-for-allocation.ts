import mongoose, { type Types } from "mongoose";
import { roundMoney2 } from "@/lib/format/money";
import { connectDb } from "@/lib/db/connect";
import { Invoice } from "@/lib/models/invoice";
import { PaymentAllocation } from "@/lib/models/payment-allocation";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";
import { workspaceScopeOrLegacy } from "@/lib/workspace/workspace-scope";

export type InvoiceWithBalance = {
  _id: Types.ObjectId;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  siteAddress: string;
  poNumber: string;
  amountGross: number;
  status: string;
  paidGross: number;
  /** Outstanding for new receipts, or max allocatable on this receipt when adjusting (excludes current remittance). */
  balanceGross: number;
};

export type OpenForAllocationOpts = {
  /**
   * When editing an existing remittance, allocations from this receipt are ignored
   * so each row’s balance is headroom for that receipt (re-allocation).
   */
  adjustForRemittanceId?: string;
};

export async function listOpenInvoicesWithBalances(
  customerId: string,
  opts?: OpenForAllocationOpts
): Promise<InvoiceWithBalance[]> {
  await connectDb();
  const workspaceId = requireWorkspaceObjectId();
  const exclude = opts?.adjustForRemittanceId
    ? new mongoose.Types.ObjectId(opts.adjustForRemittanceId)
    : null;

  const invoices = await Invoice.find(
    exclude
      ? { customerId, status: { $ne: "draft" }, ...workspaceScopeOrLegacy(workspaceId) }
      : {
          customerId,
          status: { $in: ["open", "partially_paid"] },
          ...workspaceScopeOrLegacy(workspaceId),
        }
  )
    .sort({ issueDate: 1 })
    .lean();

  if (invoices.length === 0) return [];

  const ids = invoices.map((i) => i._id);

  if (!exclude) {
    const agg = await PaymentAllocation.aggregate<{
      _id: Types.ObjectId;
      paid: number;
    }>([
      { $match: { workspaceId, invoiceId: { $in: ids } } },
      { $group: { _id: "$invoiceId", paid: { $sum: "$amountGross" } } },
    ]);
    const paidMap = new Map(agg.map((a) => [a._id.toString(), a.paid]));

    return invoices
      .map((inv) => {
        const paid = paidMap.get(inv._id.toString()) ?? 0;
        const gross = roundMoney2((Number(inv.amountNet) || 0) + (Number(inv.amountVat) || 0));
        const balance = gross - paid;
        return {
          _id: inv._id,
          invoiceNumber: inv.invoiceNumber,
          issueDate: inv.issueDate,
          dueDate: inv.dueDate,
          siteAddress: inv.siteAddress ?? "",
          poNumber: inv.poNumber ?? "",
          amountGross: gross,
          status: inv.status,
          paidGross: paid,
          balanceGross: balance,
        };
      })
      .filter((r) => r.balanceGross > 0.001);
  }

  const [paidOthersAgg, paidThisAgg] = await Promise.all([
    PaymentAllocation.aggregate<{ _id: Types.ObjectId; paid: number }>([
      {
        $match: {
          workspaceId,
          invoiceId: { $in: ids },
          remittanceId: { $ne: exclude },
        },
      },
      { $group: { _id: "$invoiceId", paid: { $sum: "$amountGross" } } },
    ]),
    PaymentAllocation.aggregate<{ _id: Types.ObjectId; paid: number }>([
      { $match: { workspaceId, invoiceId: { $in: ids }, remittanceId: exclude } },
      { $group: { _id: "$invoiceId", paid: { $sum: "$amountGross" } } },
    ]),
  ]);
  const othersMap = new Map(paidOthersAgg.map((a) => [a._id.toString(), a.paid]));
  const thisMap = new Map(paidThisAgg.map((a) => [a._id.toString(), a.paid]));

  return invoices
    .map((inv) => {
      const paidOthers = othersMap.get(inv._id.toString()) ?? 0;
      const paidThis = thisMap.get(inv._id.toString()) ?? 0;
      const paidGross = paidOthers + paidThis;
      const gross = roundMoney2((Number(inv.amountNet) || 0) + (Number(inv.amountVat) || 0));
      const headroom = gross - paidOthers;
      return {
        _id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        siteAddress: inv.siteAddress ?? "",
        poNumber: inv.poNumber ?? "",
        amountGross: gross,
        status: inv.status,
        paidGross,
        balanceGross: headroom,
      };
    })
    .filter((r) => r.balanceGross > 0.001 || (thisMap.get(r._id.toString()) ?? 0) > 0.001);
}
