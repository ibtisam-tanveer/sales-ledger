import mongoose from "mongoose";
import { v4 as uuid } from "uuid";
import {
  defaultDueDate,
  sumLineNets,
  type ParsedInvoice,
} from "@/lib/pdf/parse-facility";
import { Invoice } from "@/lib/models/invoice";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";

function normalizeParsed(raw: unknown): ParsedInvoice {
  const p = raw as ParsedInvoice & { issueDate?: string | Date | null };
  let issueDate: Date | null = null;
  if (p.issueDate instanceof Date && !isNaN(p.issueDate.getTime())) {
    issueDate = p.issueDate;
  } else if (p.issueDate) {
    const d = new Date(String(p.issueDate));
    issueDate = isNaN(d.getTime()) ? null : d;
  }
  return {
    ...p,
    issueDate,
    lines: Array.isArray(p.lines) ? p.lines : [],
    customerAddressLines: Array.isArray(p.customerAddressLines)
      ? p.customerAddressLines
      : [],
  };
}

export async function createDraftInvoiceFromParsed(params: {
  customerId: mongoose.Types.ObjectId | string;
  parsed: unknown;
  pdfStoredPath: string;
  pdfOriginalName: string;
  extractionText: string;
}) {
  const parsed = normalizeParsed(params.parsed);
  const draftUuid = uuid();
  const issueDate = parsed.issueDate ?? new Date();
  const dueDate = defaultDueDate(issueDate);
  const cid =
    typeof params.customerId === "string"
      ? new mongoose.Types.ObjectId(params.customerId)
      : params.customerId;
  const workspaceId = requireWorkspaceObjectId();

  return Invoice.create({
    workspaceId,
    customerId: cid,
    invoiceNumber: parsed.invoiceNumber || `DRAFT-${draftUuid.slice(0, 8)}`,
    poNumber: parsed.poNumber,
    issueDate,
    dueDate,
    siteAddress: parsed.siteAddress,
    currency: "GBP",
    amountNet: parsed.amountNet,
    amountVat: parsed.amountVat,
    amountGross: parsed.amountGross,
    status: "draft",
    pdfStoredPath: params.pdfStoredPath,
    pdfOriginalName: params.pdfOriginalName,
    rawExtraction: {
      text: params.extractionText.slice(0, 8000),
      parsed,
      lineSum: sumLineNets(parsed.lines),
    },
    lines: parsed.lines.map((l) => ({
      shiftDate: l.shiftDate,
      description: l.description,
      unitPrice: l.unitPrice,
      totalHours: l.totalHours,
    })),
  });
}
