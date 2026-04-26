import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db/connect";
import { coerceInvoiceCalendarDate } from "@/lib/format/dates";
import { Customer } from "@/lib/models/customer";
import { Invoice } from "@/lib/models/invoice";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";
import { workspaceScopeOrLegacy } from "@/lib/workspace/workspace-scope";

type BatchBody = {
  ids?: unknown;
  patch?: unknown;
};

type AllowedPatch = Partial<{
  customerId: string;
  poNumber: string;
  siteAddress: string;
  dueDate: string | Date;
}>;

export async function PATCH(req: Request) {
  try {
    await connectDb();
    const workspaceId = requireWorkspaceObjectId();
    const body = (await req.json().catch(() => ({}))) as BatchBody;

    const ids = Array.isArray(body.ids)
      ? (body.ids as unknown[]).map((x) => String(x)).filter(Boolean)
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "No invoices selected" }, { status: 400 });
    }

    const rawPatch = (body.patch ?? {}) as AllowedPatch;
    const update: Record<string, unknown> = {};

    if (rawPatch.customerId !== undefined) {
      const cid = String(rawPatch.customerId).trim();
      if (!cid) {
        return NextResponse.json({ error: "Customer id is required" }, { status: 400 });
      }
      const exists = await Customer.findOne({
        _id: cid,
        ...workspaceScopeOrLegacy(workspaceId),
      })
        .select("_id")
        .lean();
      if (!exists) {
        return NextResponse.json({ error: "Customer not found" }, { status: 400 });
      }
      update.customerId = cid;
    }

    if (rawPatch.poNumber !== undefined) {
      update.poNumber = String(rawPatch.poNumber ?? "");
    }
    if (rawPatch.siteAddress !== undefined) {
      update.siteAddress = String(rawPatch.siteAddress ?? "");
    }

    if (rawPatch.dueDate !== undefined) {
      const d = coerceInvoiceCalendarDate(rawPatch.dueDate);
      if (!d) {
        return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
      }
      update.dueDate = d;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No changes provided" }, { status: 400 });
    }

    const result = await Invoice.updateMany(
      { _id: { $in: ids }, ...workspaceScopeOrLegacy(workspaceId) },
      { $set: update }
    );

    return NextResponse.json({
      ok: true,
      matched: Number(result.matchedCount ?? 0),
      modified: Number(result.modifiedCount ?? 0),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

