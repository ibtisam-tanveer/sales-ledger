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

  /**
   * Statement is "as of" a point in time:
   * - include invoices issued on/before the statement date (excluding drafts)
   * - compute paid/balance using allocations received on/before the statement date
   *
   * Important: we must include invoices that are "paid" *today* but were still
   * outstanding as-of the statement date (i.e. paid in the future).
   */
  const invoices = await Invoice.find({
    customerId,
    status: { $in: ["open", "partially_paid", "paid"] },
    issueDate: { $lte: asOfEnd },
    ...workspaceScopeOrLegacy(workspaceId),
  })
    .sort({ issueDate: 1 })
    .lean();

  const rowsMaybe = await Promise.all(
    invoices.map(async (inv): Promise<StatementRow | null> => {
      const paid = await getTotalAllocatedForInvoiceUpTo(inv._id, asOfEnd);
      const gross = roundMoney2((Number(inv.amountNet) || 0) + (Number(inv.amountVat) || 0));
      const balance = gross - paid;
      if (balance <= 0.01) return null;
      const raw = inv.rawExtraction as { parsed?: { invoiceNumber?: string } } | null;
      const invNo =
        String(inv.invoiceNumber ?? "").trim() ||
        String(raw?.parsed?.invoiceNumber ?? "").trim();
      return {
        issueDate: new Date(inv.issueDate),
        invoiceNumber: invNo || "—",
        poNumber: inv.poNumber ?? "",
        siteAddress: inv.siteAddress ?? "",
        dueDate: new Date(inv.dueDate),
        amountGross: gross,
        paidGross: paid,
        balanceGross: balance,
      };
    })
  );
  const rows: StatementRow[] = rowsMaybe.filter((r): r is StatementRow => r != null);

  // Ensure deterministic ordering: date first, then invoice number within the same date.
  rows.sort((a, b) => {
    const da = a.issueDate?.getTime?.() ?? 0;
    const db = b.issueDate?.getTime?.() ?? 0;
    if (da !== db) return da - db;
    const ia = String(a.invoiceNumber ?? "").trim();
    const ib = String(b.invoiceNumber ?? "").trim();
    if (!ia && !ib) return 0;
    if (!ia) return 1;
    if (!ib) return -1;
    if (ia === "—" && ib !== "—") return 1;
    if (ib === "—" && ia !== "—") return -1;
    return ia.localeCompare(ib, undefined, { numeric: true, sensitivity: "base" });
  });

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
