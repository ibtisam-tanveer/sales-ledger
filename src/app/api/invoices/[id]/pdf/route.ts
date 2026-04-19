import fs from "fs/promises";
import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db/connect";
import { Invoice } from "@/lib/models/invoice";
import { contentDispositionHeader, sanitizeFileComponent } from "@/lib/format/download-filename";
import { isPdfUnderStorageDir, resolveStoredPath } from "@/lib/storage/validate-pdf-in-storage";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";
import { workspaceScopeOrLegacy } from "@/lib/workspace/workspace-scope";

export async function GET(
  req: Request,
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
    if (!inv) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const stored = inv.pdfStoredPath?.trim();
    if (!stored) {
      return NextResponse.json({ error: "No PDF for this invoice" }, { status: 404 });
    }

    const abs = resolveStoredPath(stored);

    if (!isPdfUnderStorageDir(abs)) {
      return NextResponse.json({ error: "Invalid stored file" }, { status: 400 });
    }

    const buf = await fs.readFile(abs);
    const url = new URL(req.url);
    const inline = url.searchParams.get("mode") === "inline";
    const rawName = inv.pdfOriginalName?.trim();
    const base =
      rawName && rawName.toLowerCase().endsWith(".pdf")
        ? sanitizeFileComponent(rawName.slice(0, -4))
        : sanitizeFileComponent(rawName || inv.invoiceNumber || id);
    const filename = `${base || `invoice-${id}`}.pdf`;
    const disposition = contentDispositionHeader(inline ? "inline" : "attachment", filename);

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": disposition,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
