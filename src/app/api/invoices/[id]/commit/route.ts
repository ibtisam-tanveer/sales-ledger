import { NextResponse } from "next/server";
import fs from "fs/promises";
import { connectDb } from "@/lib/db/connect";
import { Invoice } from "@/lib/models/invoice";
import { roundMoney2 } from "@/lib/format/money";
import { validateInvoiceMath } from "@/lib/validation/invoice-math";
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
    const inv = await Invoice.findOne({
      _id: id,
      ...workspaceScopeOrLegacy(workspaceId),
    });
    if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (inv.status !== "draft") {
      return NextResponse.json({ error: "Not a draft" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const force = body.force === true;

    const math = validateInvoiceMath(
      inv.lines.map((l: { unitPrice: number; totalHours: number }) => ({
        unitPrice: l.unitPrice,
        totalHours: l.totalHours,
      })),
      inv.amountNet,
      inv.amountVat,
      roundMoney2(inv.amountNet + inv.amountVat)
    );

    if (!force && (!math.linesMatchNet || !math.netVatMatchGross)) {
      return NextResponse.json(
        { error: "Validation failed", math },
        { status: 400 }
      );
    }

    const dup = await Invoice.findOne({
      customerId: inv.customerId,
      invoiceNumber: inv.invoiceNumber,
      status: { $ne: "draft" },
      _id: { $ne: inv._id },
      ...workspaceScopeOrLegacy(workspaceId),
    });
    if (dup) {
      return NextResponse.json(
        { error: `Invoice number already committed for this customer` },
        { status: 409 }
      );
    }

    inv.amountGross = roundMoney2(inv.amountNet + inv.amountVat);
    inv.status = "open";
    inv.postedAt = new Date();
    await inv.save();

    // Best-effort: once committed, delete the stored PDF to save space.
    // We also clear the stored path so the UI/API doesn't think the PDF still exists.
    const stored = inv.pdfStoredPath?.trim();
    if (stored) {
      const abs = resolveStoredPath(stored);
      if (abs && isPdfUnderStorageDir(abs)) {
        await fs.unlink(abs).catch(() => {});
      }
      inv.pdfStoredPath = "";
      inv.pdfOriginalName = "";
      await inv.save();
    }

    return NextResponse.json(inv);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
