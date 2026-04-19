import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db/connect";
import { Customer } from "@/lib/models/customer";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";
import { workspaceScopeOrLegacy } from "@/lib/workspace/workspace-scope";

export async function GET() {
  try {
    await connectDb();
    const workspaceId = requireWorkspaceObjectId();
    const list = await Customer.find(workspaceScopeOrLegacy(workspaceId))
      .sort({ name: 1 })
      .lean();
    return NextResponse.json(list);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectDb();
    const workspaceId = requireWorkspaceObjectId();
    const body = await req.json();
    const c = await Customer.create({
      workspaceId,
      name: body.name,
      billingAddress: body.billingAddress ?? "",
      externalRef: body.externalRef ?? "",
    });
    // Dev / stale cached models can strip unknown paths; ensure DB row is scoped.
    const hasWs = (c as { workspaceId?: unknown }).workspaceId != null;
    if (!hasWs) {
      await Customer.collection.updateOne(
        { _id: c._id },
        { $set: { workspaceId } }
      );
    }
    const out = hasWs ? c : await Customer.findById(c._id).lean();
    return NextResponse.json(out ?? c);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
