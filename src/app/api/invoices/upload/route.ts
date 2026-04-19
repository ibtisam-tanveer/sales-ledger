import { NextResponse } from "next/server";
import path from "path";
import mongoose from "mongoose";
import { v4 as uuid } from "uuid";
import { extractPdfText } from "@/lib/pdf/extract-text";
import { parseFacilityInvoiceText } from "@/lib/pdf/parse-facility";
import { extractInvoiceWithOpenAI } from "@/lib/pdf/openai-extract";
import {
  resolveCustomerForImport,
  listCustomersForPicker,
} from "@/lib/customers/resolve-for-import";
import { connectDb } from "@/lib/db/connect";
import { Customer } from "@/lib/models/customer";
import { PendingInvoiceImport } from "@/lib/models/pending-invoice-import";
import { createDraftInvoiceFromParsed } from "@/lib/invoices/create-draft-from-parsed";
import { ensureStorageDirs, pdfDir } from "@/lib/storage/paths";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";
import { workspaceScopeOrLegacy } from "@/lib/workspace/workspace-scope";
import fs from "fs/promises";

function mergeParsed(
  a: ReturnType<typeof parseFacilityInvoiceText>,
  b: Awaited<ReturnType<typeof extractInvoiceWithOpenAI>>
) {
  if (!b) return a;
  return {
    invoiceNumber: a.invoiceNumber || b.invoiceNumber,
    issueDate: a.issueDate ?? b.issueDate,
    poNumber: a.poNumber || b.poNumber,
    siteAddress: a.siteAddress || b.siteAddress,
    customerName: a.customerName || b.customerName,
    customerAddressLines:
      a.customerAddressLines.length > 0
        ? a.customerAddressLines
        : b.customerAddressLines,
    customerExternalId: a.customerExternalId || b.customerExternalId,
    lines: a.lines.length > 0 ? a.lines : b.lines,
    amountNet: a.amountNet || b.amountNet,
    amountVat: a.amountVat || b.amountVat,
    amountGross: a.amountGross || b.amountGross,
  };
}

function needsOpenAI(
  parsed: ReturnType<typeof parseFacilityInvoiceText>,
  isLowText: boolean
) {
  if (isLowText) return true;
  if (!parsed.invoiceNumber || !parsed.amountGross) return true;
  return false;
}

export async function POST(req: Request) {
  try {
    await connectDb();
    const workspaceId = requireWorkspaceObjectId();
    await ensureStorageDirs();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    const customerIdField = form.get("customerId");
    let forcedCustomerId: string | null = null;
    if (typeof customerIdField === "string" && customerIdField.trim()) {
      const cid = customerIdField.trim();
      if (!mongoose.Types.ObjectId.isValid(cid)) {
        return NextResponse.json({ error: "Invalid customerId" }, { status: 400 });
      }
      const exists = await Customer.findOne({
        _id: cid,
        ...workspaceScopeOrLegacy(workspaceId),
      }).lean();
      if (!exists) {
        return NextResponse.json({ error: "customerId not found" }, { status: 400 });
      }
      forcedCustomerId = cid;
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const name = file.name || "upload.pdf";
    const id = uuid();
    const dest = path.join(pdfDir(), `${id}.pdf`);
    await fs.writeFile(dest, buf);

    const { text, isLowText } = await extractPdfText(buf);
    let parsed = parseFacilityInvoiceText(text);

    const provider = process.env.OCR_PROVIDER ?? "none";
    const useOpenAI =
      provider === "openai" ||
      (process.env.OPENAI_API_KEY && needsOpenAI(parsed, isLowText));

    if (useOpenAI && process.env.OPENAI_API_KEY) {
      const ai = await extractInvoiceWithOpenAI(text);
      if (ai) parsed = mergeParsed(parsed, ai);
    }

    if (!parsed.customerName?.trim()) {
      return NextResponse.json(
        {
          error:
            "Could not detect customer from PDF — use manual entry or OpenAI",
          rawTextPreview: text.slice(0, 2000),
          pdfPath: dest,
        },
        { status: 422 }
      );
    }

    const parsedSnapshot = JSON.parse(JSON.stringify(parsed)) as unknown;

    let customerIdToUse = forcedCustomerId;
    if (!customerIdToUse) {
      const resolved = await resolveCustomerForImport({
        name: parsed.customerName,
        externalRef: parsed.customerExternalId,
      });
      if (resolved) {
        customerIdToUse = resolved.customerId;
      }
    }

    if (!customerIdToUse) {
      const pending = await PendingInvoiceImport.create({
        workspaceId,
        pdfStoredPath: dest,
        pdfOriginalName: name,
        extractionText: text,
        parsedSnapshot,
        extractedCustomerName: parsed.customerName,
        extractedBillingAddress: parsed.customerAddressLines.join("\n"),
        extractedExternalRef: parsed.customerExternalId ?? "",
      });
      const customers = await listCustomersForPicker();
      return NextResponse.json({
        needsCustomerResolution: true,
        pendingImportId: pending._id.toString(),
        extractedName: parsed.customerName,
        extractedExternalRef: parsed.customerExternalId ?? "",
        customers,
      });
    }

    const inv = await createDraftInvoiceFromParsed({
      customerId: customerIdToUse,
      parsed,
      pdfStoredPath: dest,
      pdfOriginalName: name,
      extractionText: text,
    });

    return NextResponse.json({ invoiceId: inv._id.toString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
