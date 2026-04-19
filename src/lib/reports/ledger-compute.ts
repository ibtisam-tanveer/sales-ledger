import { invoiceCalendarDayKeyLondon } from "@/lib/format/dates";
import { roundMoney2 } from "@/lib/format/money";
import { connectDb } from "@/lib/db/connect";
import { Invoice } from "@/lib/models/invoice";
import { Remittance } from "@/lib/models/remittance";
import { PaymentAllocation } from "@/lib/models/payment-allocation";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";
import { workspaceScopeOrLegacy } from "@/lib/workspace/workspace-scope";

/** @deprecated use invoiceCalendarDayKeyLondon — kept for any external imports */
export function dayKey(isoDate: string): string {
  return invoiceCalendarDayKeyLondon(isoDate) || isoDate.slice(0, 10);
}

export type LedgerLineBase =
  | {
      kind: "invoice";
      date: string;
      ref: string;
      net: number;
      vat: number;
      gross: number;
      balanceEffect: number;
      invoiceId: string;
    }
  | {
      kind: "payment";
      date: string;
      ref: string;
      amount: number;
      remittanceId: string;
    };

export type LedgerLineWithRunning = LedgerLineBase & { runningGross: number };

export async function computeLedgerReport(
  customerId: string,
  opts: { fromKey: string | null; toKey: string | null }
): Promise<{
  lines: LedgerLineWithRunning[];
  openingGross: number | undefined;
  allocations: unknown[];
}> {
  await connectDb();
  const workspaceId = requireWorkspaceObjectId();
  const { fromKey, toKey } = opts;

  const invoices = await Invoice.find({
    customerId,
    status: { $ne: "draft" },
    ...workspaceScopeOrLegacy(workspaceId),
  })
    .sort({ issueDate: 1 })
    .lean();

  const remittances = await Remittance.find({
    customerId,
    ...workspaceScopeOrLegacy(workspaceId),
  })
    .sort({ receivedAt: 1 })
    .lean();

  const rawLines: LedgerLineBase[] = [];

  for (const inv of invoices) {
    const net = Number(inv.amountNet) || 0;
    const vat = Number(inv.amountVat) || 0;
    const gross = roundMoney2(net + vat);
    rawLines.push({
      kind: "invoice",
      date: new Date(inv.issueDate).toISOString(),
      ref: inv.invoiceNumber,
      net,
      vat,
      gross,
      balanceEffect: gross,
      invoiceId: inv._id.toString(),
    });
  }

  for (const r of remittances) {
    rawLines.push({
      kind: "payment",
      date: new Date(r.receivedAt).toISOString(),
      ref: r.reference || r._id.toString(),
      amount: r.amountGross,
      remittanceId: r._id.toString(),
    });
  }

  rawLines.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  let openingGross = 0;
  if (fromKey) {
    for (const line of rawLines) {
      if (invoiceCalendarDayKeyLondon(line.date) >= fromKey) break;
      if (line.kind === "invoice") openingGross += line.gross;
      else openingGross -= line.amount;
    }
  }

  const inRange = rawLines.filter((line) => {
    const k = invoiceCalendarDayKeyLondon(line.date);
    if (fromKey && k < fromKey) return false;
    if (toKey && k > toKey) return false;
    return true;
  });

  let running = fromKey ? openingGross : 0;
  const lines: LedgerLineWithRunning[] = [];
  for (const line of inRange) {
    if (line.kind === "invoice") {
      running += line.gross;
      lines.push({ ...line, runningGross: running });
    } else {
      running -= line.amount;
      lines.push({ ...line, runningGross: running });
    }
  }

  const allocations = await PaymentAllocation.find({
    workspaceId,
    remittanceId: { $in: remittances.map((r) => r._id) },
  }).lean();

  return {
    lines,
    openingGross: fromKey ? openingGross : undefined,
    allocations,
  };
}
