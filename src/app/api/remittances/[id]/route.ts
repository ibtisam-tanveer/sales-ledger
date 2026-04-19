import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { replaceRemittance } from "@/lib/allocations/replace-remittance";
import { reverseRemittance } from "@/lib/allocations/reverse-remittance";
import { connectDb } from "@/lib/db/connect";
import { Invoice } from "@/lib/models/invoice";
import { PaymentAllocation } from "@/lib/models/payment-allocation";
import { Remittance } from "@/lib/models/remittance";
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
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const rem = await Remittance.findOne({ _id: id, workspaceId })
      .populate("customerId", "name")
      .lean();
    if (!rem) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const allocs = await PaymentAllocation.find({ workspaceId, remittanceId: id }).lean();
    const invIds = [...new Set(allocs.map((a) => a.invoiceId.toString()))];
    const invoices =
      invIds.length === 0
        ? []
        : await Invoice.find({
            _id: { $in: invIds },
            ...workspaceScopeOrLegacy(workspaceId),
          })
            .select("invoiceNumber")
            .lean();
    const invNum = new Map(invoices.map((i) => [i._id.toString(), i.invoiceNumber]));
    const allocations = allocs.map((a) => ({
      invoiceId: a.invoiceId.toString(),
      amountGross: a.amountGross,
      invoiceNumber: invNum.get(a.invoiceId.toString()) ?? "",
    }));
    return NextResponse.json({ remittance: rem, allocations });
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
    const { id } = await ctx.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const body = await req.json();
    const result = await replaceRemittance(id, {
      receivedAt: new Date(body.receivedAt),
      amountGross: Number(body.amountGross),
      reference: typeof body.reference === "string" ? body.reference : undefined,
      method: typeof body.method === "string" ? body.method : undefined,
      bankAccountKey:
        typeof body.bankAccountKey === "string" ? body.bankAccountKey : undefined,
      allocations: (body.allocations ?? []).map(
        (a: { invoiceId: string; amountGross: number }) => ({
          invoiceId: a.invoiceId,
          amountGross: Number(a.amountGross),
        })
      ),
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    await reverseRemittance(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
