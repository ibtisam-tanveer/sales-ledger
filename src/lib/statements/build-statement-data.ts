import { endOfDay } from "date-fns";
import { roundMoney2 } from "@/lib/format/money";
import { connectDb } from "@/lib/db/connect";
import { resolveCompanyLogoFilePath } from "@/lib/company-settings/resolve-logo-path";
import { Customer } from "@/lib/models/customer";
import { Invoice } from "@/lib/models/invoice";
import { getCompanySettings } from "@/lib/company-settings/service";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";
import { workspaceScopeOrLegacy } from "@/lib/workspace/workspace-scope";
import { getTotalAllocatedForInvoiceUpTo } from "@/lib/invoices/allocated-sum";
import type { CompanyHeader, StatementRow } from "@/lib/statement-pdf/statement-document";

export type StatementBuildResult = {
  customerName: string;
  customerAddress: string;
  company: CompanyHeader;
  statementDate: Date;
  rows: StatementRow[];
};

export async function buildStatementData(
  customerId: string,
  statementDate: Date
): Promise<{ ok: true; data: StatementBuildResult } | { ok: false; error: string; status: number }> {
  await connectDb();
  const workspaceId = requireWorkspaceObjectId();
  const customer = await Customer.findOne({
    _id: customerId,
    ...workspaceScopeOrLegacy(workspaceId),
  }).lean();
  if (!customer) {
    return { ok: false, error: "Customer not found", status: 404 };
  }

  const companySettings = await getCompanySettings();
  const logoPath = resolveCompanyLogoFilePath(companySettings.logoPath);

  const asOfEnd = endOfDay(statementDate);

  const invoices = await Invoice.find({
    customerId,
    status: { $ne: "draft" },
    issueDate: { $lte: asOfEnd },
    ...workspaceScopeOrLegacy(workspaceId),
  })
    .sort({ issueDate: 1 })
    .lean();

  const rows: StatementRow[] = [];
  for (const inv of invoices) {
    const paid = await getTotalAllocatedForInvoiceUpTo(inv._id, asOfEnd);
    const gross = roundMoney2((Number(inv.amountNet) || 0) + (Number(inv.amountVat) || 0));
    const balance = gross - paid;
    if (balance <= 0.01) continue;
    const raw = inv.rawExtraction as { parsed?: { invoiceNumber?: string } } | null;
    const invNo =
      String(inv.invoiceNumber ?? "").trim() ||
      String(raw?.parsed?.invoiceNumber ?? "").trim();
    rows.push({
      issueDate: new Date(inv.issueDate),
      invoiceNumber: invNo || "—",
      poNumber: inv.poNumber ?? "",
      siteAddress: inv.siteAddress ?? "",
      dueDate: new Date(inv.dueDate),
      amountGross: gross,
      paidGross: paid,
      balanceGross: balance,
    });
  }

  const company: CompanyHeader = {
    legalName: companySettings.legalName ?? "",
    registeredAddress: companySettings.registeredAddress ?? "",
    companyRegistrationNumber: companySettings.companyRegistrationNumber ?? "",
    vatNumber: companySettings.vatNumber ?? "",
    logoPath,
  };

  return {
    ok: true,
    data: {
      customerName: customer.name,
      customerAddress: customer.billingAddress ?? "",
      company,
      statementDate,
      rows,
    },
  };
}
