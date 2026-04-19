import { roundMoney2 } from "@/lib/format/money";
import { connectDb } from "@/lib/db/connect";
import { Invoice } from "@/lib/models/invoice";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";
import { workspaceScopeOrLegacy } from "@/lib/workspace/workspace-scope";

export type VatReportRow = {
  _id: string;
  invoiceNumber: string;
  issueDate: string;
  amountNet: number;
  amountVat: number;
  amountGross: number;
};

export async function queryVatReport(params: {
  from?: string | null;
  to?: string | null;
  customerId?: string | null;
}): Promise<{ rows: VatReportRow[]; totals: { net: number; vat: number; gross: number } }> {
  await connectDb();
  const workspaceId = requireWorkspaceObjectId();
  const { from, to, customerId } = params;

  const q: Record<string, unknown> = {
    ...workspaceScopeOrLegacy(workspaceId),
    status: { $in: ["open", "partially_paid", "paid"] },
  };
  if (customerId) q.customerId = customerId;
  if (from || to) {
    q.issueDate = {};
    if (from) (q.issueDate as Record<string, Date>).$gte = new Date(from);
    if (to) (q.issueDate as Record<string, Date>).$lte = new Date(to);
  }

  const docs = await Invoice.find(q).sort({ issueDate: 1 }).lean();
  const rows: VatReportRow[] = docs.map((r) => {
    const net = Number(r.amountNet) || 0;
    const vat = Number(r.amountVat) || 0;
    return {
      _id: r._id.toString(),
      invoiceNumber: r.invoiceNumber,
      issueDate: new Date(r.issueDate).toISOString(),
      amountNet: net,
      amountVat: vat,
      amountGross: roundMoney2(net + vat),
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      net: acc.net + r.amountNet,
      vat: acc.vat + r.amountVat,
      gross: acc.gross + r.amountGross,
    }),
    { net: 0, vat: 0, gross: 0 }
  );

  return { rows, totals };
}
