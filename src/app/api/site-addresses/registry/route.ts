import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db/connect";
import { SiteAddress } from "@/lib/models/site-address";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";

/** Full list of saved site addresses (for maintenance screen). */
export async function GET() {
  try {
    await connectDb();
    const workspaceId = requireWorkspaceObjectId();
    const list = await SiteAddress.find({ workspaceId }).sort({ address: 1 }).lean();
    return NextResponse.json(list);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
