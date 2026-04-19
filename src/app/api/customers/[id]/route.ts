import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDb } from "@/lib/db/connect";
import { Customer } from "@/lib/models/customer";
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
    const c = await Customer.findOne({
      _id: id,
      ...workspaceScopeOrLegacy(workspaceId),
    }).lean();
    if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(c);
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
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const body = await req.json();
    const c = await Customer.findOne({
      _id: id,
      ...workspaceScopeOrLegacy(workspaceId),
    });
    if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (body.name !== undefined) c.name = String(body.name).trim();
    if (body.billingAddress !== undefined) c.billingAddress = String(body.billingAddress);
    if (body.externalRef !== undefined) c.externalRef = String(body.externalRef);
    if (body.defaultCurrency !== undefined) c.defaultCurrency = String(body.defaultCurrency);

    if (typeof c.name === "string" && !c.name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    await c.save();
    return NextResponse.json(c);
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
    await connectDb();
    const workspaceId = requireWorkspaceObjectId();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const doc = await Customer.findOneAndDelete({
      _id: id,
      ...workspaceScopeOrLegacy(workspaceId),
    });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
