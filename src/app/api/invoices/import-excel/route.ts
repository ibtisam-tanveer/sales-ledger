import { NextResponse } from "next/server";
import { defaultDueDate } from "@/lib/pdf/parse-facility";
import { getCompanySettings } from "@/lib/company-settings/service";
import type { InvoiceImportTemplate } from "@/lib/company-settings/invoice-import-template";
import { connectDb } from "@/lib/db/connect";
import { formatPounds } from "@/lib/format/money";
import { Customer } from "@/lib/models/customer";
import { Invoice } from "@/lib/models/invoice";
import { SiteAddress } from "@/lib/models/site-address";
import {
  parseInvoiceExcelAsync,
  type ParsedInvoiceRow,
} from "@/lib/invoices/import-excel-rows";
import { validateInvoiceMath } from "@/lib/validation/invoice-math";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";
import { workspaceScopeOrLegacy } from "@/lib/workspace/workspace-scope";

export const maxDuration = 120;

const VAT_TOLERANCE = 0.05;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function importOneRow(
  row: ParsedInvoiceRow
): Promise<{ ok: true } | { ok: false; message: string }> {
  const workspaceId = requireWorkspaceObjectId();
  const cust = await Customer.findOne({
    name: new RegExp(`^${escapeRegex(row.customerName.trim())}$`, "i"),
    ...workspaceScopeOrLegacy(workspaceId),
  });
  if (!cust) {
    return {
      ok: false,
      message: `Row ${row.excelRow}: customer "${row.customerName}" not found — add the customer first.`,
    };
  }

  const invNo = row.invoiceNumber.trim();
  const dup = await Invoice.findOne({
    customerId: cust._id,
    invoiceNumber: invNo,
    ...workspaceScopeOrLegacy(workspaceId),
  });
  if (dup) {
    return {
      ok: false,
      message: `Row ${row.excelRow}: invoice ${invNo} already exists for this customer.`,
    };
  }

  const lines = [
    {
      shiftDate: "",
      description: "Imported",
      unitPrice: row.amountNet,
      totalHours: 1,
    },
  ];
  const math = validateInvoiceMath(
    lines,
    row.amountNet,
    row.amountVat,
    row.amountGross
  );
  if (!math.linesMatchNet || !math.netVatMatchGross) {
    return {
      ok: false,
      message: `Row ${row.excelRow}: net/VAT/gross do not balance.`,
    };
  }

  const maxVat = row.amountNet * 0.2 + VAT_TOLERANCE;
  if (row.amountVat < 0 || row.amountVat > maxVat) {
    return {
      ok: false,
      message: `Row ${row.excelRow}: VAT must be between ${formatPounds(0)} and ${formatPounds(maxVat)}.`,
    };
  }

  const dueDate = row.dueDate ?? defaultDueDate(row.issueDate);
  const siteTrimmed = row.siteAddress.trim();

  await Invoice.create({
    workspaceId,
    customerId: cust._id,
    invoiceNumber: invNo,
    poNumber: row.poNumber,
    issueDate: row.issueDate,
    dueDate,
    siteAddress: siteTrimmed,
    currency: "GBP",
    amountNet: row.amountNet,
    amountVat: row.amountVat,
    amountGross: row.amountGross,
    status: row.status,
    pdfStoredPath: "",
    pdfOriginalName: "",
    rawExtraction: {
      source: "excel-import",
      excelRow: row.excelRow,
      importedAt: new Date().toISOString(),
    },
    lines,
  });

  if (siteTrimmed) {
    try {
      await SiteAddress.findOneAndUpdate(
        { workspaceId, address: siteTrimmed },
        { $setOnInsert: { workspaceId, address: siteTrimmed } },
        { upsert: true }
      );
    } catch {
      // ignore
    }
  }

  return { ok: true };
}

export async function POST(req: Request) {
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (!ct.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Expected multipart/form-data with file and templateId" },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    const templateId = form.get("templateId");

    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ error: "Missing or empty file" }, { status: 400 });
    }
    if (typeof templateId !== "string" || !templateId.trim()) {
      return NextResponse.json({ error: "templateId is required" }, { status: 400 });
    }

    await connectDb();
    const settings = await getCompanySettings();
    const templates = (settings.invoiceImportTemplates ?? []) as InvoiceImportTemplate[];
    const template = templates.find((t) => t.id === templateId.trim());
    if (!template) {
      return NextResponse.json(
        { error: "Import template not found — check Settings → Company details." },
        { status: 400 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const { rows, errors: parseErrors } = await parseInvoiceExcelAsync(buf, template);

    const rowErrors: string[] = [...parseErrors];
    let created = 0;

    for (const row of rows) {
      const result = await importOneRow(row);
      if (result.ok) {
        created += 1;
      } else {
        rowErrors.push(result.message);
      }
    }

    return NextResponse.json({
      created,
      rowCount: rows.length,
      errors: rowErrors,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
