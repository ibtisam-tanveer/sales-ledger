import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db/connect";
import { Customer } from "@/lib/models/customer";
import { PendingInvoiceImport } from "@/lib/models/pending-invoice-import";
import { createDraftInvoiceFromParsed } from "@/lib/invoices/create-draft-from-parsed";
import { isPdfUnderStorageDir, resolveStoredPath } from "@/lib/storage/validate-pdf-in-storage";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";
import { workspaceScopeOrLegacy } from "@/lib/workspace/workspace-scope";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await connectDb();
    const workspaceId = requireWorkspaceObjectId();
    const { id } = await ctx.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const body = await req.json();
    const customerId = typeof body.customerId === "string" ? body.customerId.trim() : "";
    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
      return NextResponse.json({ error: "customerId required" }, { status: 400 });
    }
    const customer = await Customer.findOne({
      _id: customerId,
      ...workspaceScopeOrLegacy(workspaceId),
    });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const pending = await PendingInvoiceImport.findOneAndDelete({
      _id: id,
      ...workspaceScopeOrLegacy(workspaceId),
    }).lean();
    if (!pending) {
      return NextResponse.json({ error: "Pending import not found or already completed" }, { status: 404 });
    }

    const abs = resolveStoredPath(pending.pdfStoredPath);
    if (!isPdfUnderStorageDir(abs)) {
      return NextResponse.json({ error: "Stored PDF is not valid" }, { status: 400 });
    }

    const inv = await createDraftInvoiceFromParsed({
      customerId,
      parsed: pending.parsedSnapshot,
      pdfStoredPath: pending.pdfStoredPath,
      pdfOriginalName: pending.pdfOriginalName ?? "",
      extractionText: pending.extractionText,
    });

    return NextResponse.json({ invoiceId: inv._id.toString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
