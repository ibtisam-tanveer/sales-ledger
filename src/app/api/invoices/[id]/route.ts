import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db/connect";
import { coerceInvoiceCalendarDate } from "@/lib/format/dates";
import { roundMoney2 } from "@/lib/format/money";
import { Customer } from "@/lib/models/customer";
import { Invoice } from "@/lib/models/invoice";
import { getTotalAllocatedForInvoice } from "@/lib/invoices/allocated-sum";
import { deleteInvoiceAndUnallocatePayments } from "@/lib/invoices/delete-invoice";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";
import { workspaceScopeOrLegacy } from "@/lib/workspace/workspace-scope";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await connectDb();
    const workspaceId = requireWorkspaceObjectId();
    const { id } = await ctx.params;
    const inv = await Invoice.findOne({
      _id: id,
      ...workspaceScopeOrLegacy(workspaceId),
    }).lean();
    if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const allocated = await getTotalAllocatedForInvoice(id);
    const hasPdf = Boolean(inv.pdfStoredPath?.trim());
    const { pdfStoredPath: _p, ...rest } = inv as Record<string, unknown> & {
      pdfStoredPath?: string;
    };
    void _p;
    const net = Number(inv.amountNet) || 0;
    const vat = Number(inv.amountVat) || 0;
    return NextResponse.json({
      ...rest,
      amountGross: roundMoney2(net + vat),
      allocatedGross: allocated,
      hasPdf,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await connectDb();
    const workspaceId = requireWorkspaceObjectId();
    const { id } = await ctx.params;
    const body = await req.json();
    const inv = await Invoice.findOne({
      _id: id,
      ...workspaceScopeOrLegacy(workspaceId),
    });
    if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const allowed = [
      "invoiceNumber",
      "poNumber",
      "issueDate",
      "dueDate",
      "siteAddress",
      "amountNet",
      "amountVat",
      "amountGross",
      "customerId",
      "lines",
      "billingFrequency",
      "billingPeriodLabel",
    ] as const;

    for (const k of allowed) {
      if (body[k] === undefined) continue;
      if (k === "customerId") {
        const cid =
          typeof body.customerId === "string" ? body.customerId.trim() : String(body.customerId);
        const exists = await Customer.findOne({
          _id: cid,
          ...workspaceScopeOrLegacy(workspaceId),
        }).lean();
        if (!exists) {
          return NextResponse.json({ error: "Customer not found" }, { status: 400 });
        }
        inv.set("customerId", cid);
        continue;
      }
      if (k === "issueDate" || k === "dueDate") {
        const d = coerceInvoiceCalendarDate(body[k]);
        if (d) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (inv as any)[k] = d;
        }
        continue;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (inv as any)[k] = body[k];
    }

    await inv.save();
    const lean = inv.toObject();
    const hasPdf = Boolean(lean.pdfStoredPath?.trim());
    const { pdfStoredPath: _p2, ...rest } = lean as Record<string, unknown> & {
      pdfStoredPath?: string;
    };
    void _p2;
    const allocated = await getTotalAllocatedForInvoice(id);
    const netP = Number(lean.amountNet) || 0;
    const vatP = Number(lean.amountVat) || 0;
    return NextResponse.json({
      ...rest,
      amountGross: roundMoney2(netP + vatP),
      allocatedGross: allocated,
      hasPdf,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;

    const result = await deleteInvoiceAndUnallocatePayments({
      invoiceId: id,
      force,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
