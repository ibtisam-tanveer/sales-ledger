import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { formatPounds } from "@/lib/format/money";
import { connectDb } from "@/lib/db/connect";
import { Customer } from "@/lib/models/customer";
import { Invoice } from "@/lib/models/invoice";
import { defaultDueDate } from "@/lib/pdf/parse-facility";
import { SiteAddress } from "@/lib/models/site-address";
import { validateInvoiceMath } from "@/lib/validation/invoice-math";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";
import { workspaceScopeOrLegacy } from "@/lib/workspace/workspace-scope";

const VAT_TOLERANCE = 0.05;

type LineInput = {
  shiftDate?: string;
  description?: string;
  unitPrice: number;
  totalHours: number;
};

export async function POST(req: Request) {
  try {
    await connectDb();
    const workspaceId = requireWorkspaceObjectId();
    const body = await req.json();

    const customerId = body.customerId as string | undefined;
    if (!customerId || !mongoose.isValidObjectId(customerId)) {
      return NextResponse.json({ error: "Valid customerId is required" }, { status: 400 });
    }

    const customer = await Customer.findOne({
      _id: customerId,
      ...workspaceScopeOrLegacy(workspaceId),
    });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const amountNet = Number(body.amountNet);
    const amountVat = Number(body.amountVat);
    const amountGross = Number(body.amountGross);
    if (!Number.isFinite(amountNet) || !Number.isFinite(amountVat) || !Number.isFinite(amountGross)) {
      return NextResponse.json(
        { error: "amountNet, amountVat and amountGross must be valid numbers" },
        { status: 400 }
      );
    }

    if (amountNet <= 0) {
      return NextResponse.json({ error: "Net amount must be greater than zero" }, { status: 400 });
    }

    const maxVat = amountNet * 0.2 + VAT_TOLERANCE;
    if (amountVat < 0 || amountVat > maxVat) {
      return NextResponse.json(
        {
          error: `VAT must be between ${formatPounds(0)} and ${formatPounds(maxVat)} (no more than 20% of net, including rounding).`,
        },
        { status: 400 }
      );
    }

    let issueDate: Date;
    if (body.issueDate) {
      issueDate = new Date(body.issueDate);
      if (Number.isNaN(issueDate.getTime())) {
        return NextResponse.json({ error: "Invalid issueDate" }, { status: 400 });
      }
    } else {
      issueDate = new Date();
    }

    let dueDate: Date;
    if (body.dueDate) {
      dueDate = new Date(body.dueDate);
      if (Number.isNaN(dueDate.getTime())) {
        return NextResponse.json({ error: "Invalid dueDate" }, { status: 400 });
      }
    } else {
      dueDate = defaultDueDate(issueDate);
    }

    const invoiceNumberRaw = typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim() : "";
    if (!invoiceNumberRaw) {
      return NextResponse.json({ error: "Invoice number is required" }, { status: 400 });
    }
    const invoiceNumber = invoiceNumberRaw;

    let lines: LineInput[] = Array.isArray(body.lines) ? body.lines : [];
    lines = lines
      .filter(
        (l) =>
          l &&
          typeof l === "object" &&
          Number.isFinite(Number(l.unitPrice)) &&
          Number.isFinite(Number(l.totalHours))
      )
      .map((l) => ({
        shiftDate: typeof l.shiftDate === "string" ? l.shiftDate : "",
        description: typeof l.description === "string" ? l.description : "",
        unitPrice: Number(l.unitPrice),
        totalHours: Number(l.totalHours),
      }));

    if (lines.length === 0) {
      lines = [
        {
          shiftDate: "",
          description: "Services",
          unitPrice: amountNet,
          totalHours: 1,
        },
      ];
    }

    const math = validateInvoiceMath(lines, amountNet, amountVat, amountGross);
    if (!math.linesMatchNet || !math.netVatMatchGross) {
      return NextResponse.json(
        {
          error: "Amounts do not balance — check net, VAT, gross and line totals",
          math,
        },
        { status: 400 }
      );
    }

    const siteTrimmed =
      typeof body.siteAddress === "string" ? body.siteAddress.trim() : "";

    const inv = await Invoice.create({
      workspaceId,
      customerId,
      invoiceNumber,
      poNumber: typeof body.poNumber === "string" ? body.poNumber : "",
      issueDate,
      dueDate,
      siteAddress: siteTrimmed,
      currency: "GBP",
      amountNet,
      amountVat,
      amountGross,
      status: "draft",
      pdfStoredPath: "",
      pdfOriginalName: "",
      rawExtraction: { manual: true, createdAt: new Date().toISOString() },
      lines,
    });

    if (siteTrimmed) {
      try {
        await SiteAddress.findOneAndUpdate(
          { workspaceId, address: siteTrimmed },
          { $setOnInsert: { workspaceId, address: siteTrimmed } },
          { upsert: true }
        );
      } catch (e) {
        console.error("SiteAddress upsert:", e);
      }
    }

    return NextResponse.json({ invoiceId: inv._id.toString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
