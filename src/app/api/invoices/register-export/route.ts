import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { buildInvoiceRegisterExcelBuffer } from "@/lib/invoice-register/build-register-excel";
import type { InvoiceRegisterExportRow } from "@/lib/invoice-register/invoice-register-export-row";
import { renderInvoiceRegisterPdfBuffer } from "@/lib/invoice-register/render-register-pdf";
import { connectDb } from "@/lib/db/connect";
import {
  contentDispositionHeader,
  invoiceRegisterFilename,
} from "@/lib/format/download-filename";
import { roundMoney2 } from "@/lib/format/money";
import { Invoice } from "@/lib/models/invoice";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";
import { workspaceScopeOrLegacy } from "@/lib/workspace/workspace-scope";

const MAX_IDS = 5000;

const bodySchema = z.object({
  format: z.enum(["pdf", "xlsx"]),
  ids: z.array(z.string()).min(1).max(MAX_IDS),
});

function uniqueOrderedIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function mapDocToExportRow(doc: Record<string, unknown>): InvoiceRegisterExportRow {
  const pop = doc.customerId as unknown;
  let customerName = "—";
  if (pop && typeof pop === "object" && pop !== null && "_id" in pop) {
    const p = pop as { name?: string };
    customerName = typeof p.name === "string" && p.name.trim() ? p.name : "—";
  }
  const net = Number(doc.amountNet) || 0;
  const vat = Number(doc.amountVat) || 0;
  const postedRaw = doc.postedAt;
  const postedAt =
    postedRaw != null
      ? new Date(postedRaw as Date | string).toISOString()
      : null;
  const pdfPath = doc.pdfStoredPath;
  return {
    _id: String(doc._id),
    invoiceNumber: String(doc.invoiceNumber ?? ""),
    issueDate: String(doc.issueDate ?? ""),
    postedAt,
    customerName,
    siteAddress: typeof doc.siteAddress === "string" ? doc.siteAddress : "",
    status: String(doc.status ?? ""),
    amountNet: roundMoney2(net),
    amountVat: roundMoney2(vat),
    amountGross: roundMoney2(net + vat),
    hasPdf: Boolean(typeof pdfPath === "string" && pdfPath.trim()),
  };
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request: provide format (pdf or xlsx) and ids array." },
        { status: 400 }
      );
    }
    const { format } = parsed.data;
    const ids = uniqueOrderedIds(parsed.data.ids);
    for (const id of ids) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return NextResponse.json({ error: "Invalid invoice id." }, { status: 400 });
      }
    }

    await connectDb();
    const workspaceId = requireWorkspaceObjectId();
    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));

    const docs = await Invoice.find({
      _id: { $in: objectIds },
      ...workspaceScopeOrLegacy(workspaceId),
    })
      .populate("customerId", "name")
      .lean();

    const byId = new Map<string, InvoiceRegisterExportRow>();
    for (const d of docs) {
      byId.set(String(d._id), mapDocToExportRow(d as Record<string, unknown>));
    }

    const rows: InvoiceRegisterExportRow[] = [];
    for (const id of ids) {
      const row = byId.get(id);
      if (!row) {
        return NextResponse.json(
          {
            error:
              "One or more invoices were not found or are not in this workspace. Refresh the page and try again.",
          },
          { status: 400 }
        );
      }
      rows.push(row);
    }

    const totals = {
      net: roundMoney2(rows.reduce((s, r) => s + r.amountNet, 0)),
      vat: roundMoney2(rows.reduce((s, r) => s + r.amountVat, 0)),
      gross: roundMoney2(rows.reduce((s, r) => s + r.amountGross, 0)),
    };

    const filename = invoiceRegisterFilename(format);

    if (format === "xlsx") {
      const buffer = await buildInvoiceRegisterExcelBuffer({ rows, totals });
      return new NextResponse(Buffer.from(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": contentDispositionHeader("attachment", filename),
        },
      });
    }

    const buffer = await renderInvoiceRegisterPdfBuffer({ rows, totals });
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDispositionHeader("attachment", filename),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
