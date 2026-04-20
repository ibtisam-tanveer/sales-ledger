import { NextResponse } from "next/server";
import { roundMoney2 } from "@/lib/format/money";
import { connectDb } from "@/lib/db/connect";
import { Invoice } from "@/lib/models/invoice";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";
import { workspaceScopeOrLegacy } from "@/lib/workspace/workspace-scope";

export async function GET(req: Request) {
  try {
    await connectDb();
    const workspaceId = requireWorkspaceObjectId();
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("customerId");
    const status = searchParams.get("status");
    const q: Record<string, unknown> = { ...workspaceScopeOrLegacy(workspaceId) };
    if (customerId) q.customerId = customerId;
    if (status) q.status = status;
    const list = await Invoice.find(q)
      .populate("customerId", "name")
      .sort({ issueDate: -1 })
      .lean();

    return NextResponse.json(
      list.map((doc) => {
        const pop = doc.customerId as unknown;
        let customerIdStr = "";
        let customerName = "—";
        if (pop && typeof pop === "object" && "_id" in pop) {
          const p = pop as { _id: unknown; name?: string };
          customerIdStr = String(p._id);
          customerName = typeof p.name === "string" && p.name.trim() ? p.name : "—";
        } else if (doc.customerId) {
          customerIdStr = String(doc.customerId);
        }
        const net = Number(doc.amountNet) || 0;
        const vat = Number(doc.amountVat) || 0;
        const postedAt = doc.postedAt
          ? new Date(doc.postedAt as Date).toISOString()
          : null;
        return {
          _id: String(doc._id),
          customerId: customerIdStr,
          customerName,
          invoiceNumber: doc.invoiceNumber,
          issueDate: doc.issueDate,
          postedAt,
          status: doc.status,
          amountNet: roundMoney2(net),
          amountVat: roundMoney2(vat),
          amountGross: roundMoney2(net + vat),
          siteAddress: doc.siteAddress ?? "",
          hasPdf: Boolean(doc.pdfStoredPath?.trim()),
        };
      })
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
