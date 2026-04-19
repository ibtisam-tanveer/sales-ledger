import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDb } from "@/lib/db/connect";
import { SiteAddress } from "@/lib/models/site-address";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";

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
    const address = typeof body.address === "string" ? body.address.trim() : "";
    if (!address) {
      return NextResponse.json({ error: "address is required" }, { status: 400 });
    }

    const existing = await SiteAddress.findOne({ _id: id, workspaceId });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const dup = await SiteAddress.findOne({
      workspaceId,
      address,
      _id: { $ne: id },
    }).lean();
    if (dup) {
      return NextResponse.json({ error: "That site address already exists" }, { status: 409 });
    }

    existing.address = address;
    await existing.save();
    return NextResponse.json(existing);
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
    const doc = await SiteAddress.findOneAndDelete({ _id: id, workspaceId });
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
