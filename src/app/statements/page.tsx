"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { parseISO } from "date-fns";
import { formatInvoiceDate, formatUiDate } from "@/lib/format/dates";
import { formatPounds } from "@/lib/format/money";
import { usePersistedPageState } from "@/hooks/usePersistedPageState";
import { computeStatementTotals } from "@/lib/statements/statement-math";
import type { StatementRow } from "@/lib/statement-pdf/statement-document";
import { ReportPreviewDialog } from "@/components/ReportPreviewDialog";
import { selectDateInputOnFocus } from "@/lib/ui/date-input-focus";

type Customer = { _id: string; name: string };

type StatementDataJson = {
  customerName: string;
  customerAddress: string;
  statementDate: string;
  rows: Array<
    Omit<StatementRow, "issueDate" | "dueDate"> & {
      issueDate: string;
      dueDate: string;
    }
  >;
};

function StatementsInner() {
  const sp = useSearchParams();
  const pre = sp.get("customerId") ?? "";
  const [customers, setCustomers] = useState<Customer[]>([]);
  const defaultDraft = useMemo(
    () => ({
      customerId: "",
      asOf: new Date().toISOString().slice(0, 10),
    }),
    []
  );
  const [draft, setDraft] = usePersistedPageState(defaultDraft);
  const { customerId, asOf } = draft;

  const [excelPreviewOpen, setExcelPreviewOpen] = useState(false);
  const [excelPreviewData, setExcelPreviewData] =
    useState<StatementDataJson | null>(null);
  const [excelPreviewErr, setExcelPreviewErr] = useState("");
  const [excelPreviewLoading, setExcelPreviewLoading] = useState(false);

  useEffect(() => {
    fetch("/api/customers", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setCustomers(d);
      });
  }, []);

  useEffect(() => {
    if (pre) setDraft((d) => ({ ...d, customerId: pre }));
  }, [pre, setDraft]);

  const pdfViewUrl = useMemo(() => {
    if (!customerId) return "";
    return `/api/statements/${customerId}/pdf?asOf=${encodeURIComponent(asOf)}&mode=inline`;
  }, [customerId, asOf]);

  const pdfDownloadUrl = useMemo(() => {
    if (!customerId) return "";
    return `/api/statements/${customerId}/pdf?asOf=${encodeURIComponent(asOf)}`;
  }, [customerId, asOf]);

  const excelUrl = useMemo(() => {
    if (!customerId) return "";
    return `/api/statements/${customerId}/xlsx?asOf=${encodeURIComponent(asOf)}`;
  }, [customerId, asOf]);

  function scrollToPdfPreview() {
    document
      .getElementById("statement-pdf-preview")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function openExcelPreview() {
    if (!customerId) return;
    setExcelPreviewLoading(true);
    setExcelPreviewErr("");
    try {
      const r = await fetch(
        `/api/statements/${customerId}/data?asOf=${encodeURIComponent(asOf)}`
      );
      const d = await r.json();
      if (!r.ok) {
        setExcelPreviewErr(d.error ?? "Could not load statement data");
        setExcelPreviewData(null);
        setExcelPreviewOpen(true);
        return;
      }
      setExcelPreviewData(d as StatementDataJson);
      setExcelPreviewOpen(true);
    } finally {
      setExcelPreviewLoading(false);
    }
  }

  const excelTotals = useMemo(() => {
    if (!excelPreviewData) return null;
    const sd = parseISO(excelPreviewData.statementDate);
    const rowsParsed: StatementRow[] = excelPreviewData.rows.map((r) => ({
      ...r,
      issueDate: parseISO(r.issueDate),
      dueDate: parseISO(r.dueDate),
    }));
    return computeStatementTotals(sd, rowsParsed);
  }, [excelPreviewData]);

  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Customer statement</h1>
      <p className="text-sm text-slate-600">
        Outstanding balances are as at the statement date (invoices issued on or before;
        payments from receipts received on or before). Use{" "}
        <strong>Preview PDF</strong> for the full PDF layout, or{" "}
        <strong>Preview Excel</strong> for the same figures in a table (matches the
        Excel file). Download PDF or Excel when ready.
      </p>
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm text-sm">
        <label className="grid gap-1 font-medium text-slate-800">
          Customer
          <select
            className="rounded border border-slate-300 bg-white px-2 py-2 text-slate-900"
            value={customerId}
            onChange={(e) =>
              setDraft((d) => ({ ...d, customerId: e.target.value }))
            }
          >
            <option value="">Select…</option>
            {customers.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 font-medium text-slate-800">
          Statement date (as of)
          <input
            type="date"
            className="rounded border border-slate-300 bg-white px-2 py-2 text-slate-900"
            value={asOf}
            onFocus={selectDateInputOnFocus}
            onChange={(e) => setDraft((d) => ({ ...d, asOf: e.target.value }))}
          />
        </label>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            disabled={!customerId}
            onClick={scrollToPdfPreview}
            className={`inline-flex rounded border border-slate-300 px-4 py-2 text-sm font-medium ${
              customerId
                ? "bg-white text-slate-900 hover:bg-slate-50"
                : "cursor-not-allowed bg-slate-100 text-slate-500"
            }`}
          >
            Preview PDF
          </button>
          <button
            type="button"
            disabled={!customerId || excelPreviewLoading}
            onClick={() => void openExcelPreview()}
            className={`inline-flex rounded border border-slate-300 px-4 py-2 text-sm font-medium ${
              customerId
                ? "bg-white text-slate-900 hover:bg-slate-50"
                : "cursor-not-allowed bg-slate-100 text-slate-500"
            }`}
          >
            {excelPreviewLoading ? "Loading…" : "Preview Excel"}
          </button>
          <a
            href={pdfDownloadUrl || "#"}
            aria-disabled={!customerId}
            className={`inline-flex rounded px-4 py-2 text-sm font-medium text-white ${
              customerId
                ? "bg-zinc-900 hover:bg-zinc-800"
                : "cursor-not-allowed bg-zinc-400 pointer-events-none"
            }`}
          >
            Download PDF
          </a>
          <a
            href={excelUrl || "#"}
            aria-disabled={!customerId}
            className={`inline-flex rounded border border-slate-300 px-4 py-2 text-sm font-medium ${
              customerId
                ? "bg-white text-slate-900 hover:bg-slate-50"
                : "cursor-not-allowed bg-slate-100 text-slate-500 pointer-events-none"
            }`}
          >
            Download Excel
          </a>
        </div>
      </div>

      <div
        id="statement-pdf-preview"
        className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm scroll-mt-4"
      >
        <div className="border-b border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
          Preview (PDF)
        </div>
        {!customerId ? (
          <p className="p-8 text-center text-sm text-slate-500">Select a customer to preview.</p>
        ) : (
          <iframe
            key={`${customerId}-${asOf}`}
            title="Statement PDF preview"
            className="h-[75vh] w-full bg-white"
            src={pdfViewUrl}
          />
        )}
      </div>

      <ReportPreviewDialog
        open={excelPreviewOpen}
        onClose={() => setExcelPreviewOpen(false)}
        title="Statement — Excel export preview"
      >
        {excelPreviewErr ? (
          <p className="text-sm text-red-600">{excelPreviewErr}</p>
        ) : excelPreviewData ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-900">
              {excelPreviewData.customerName}
            </p>
            <p className="text-xs text-slate-600">
              Statement date:{" "}
              {formatUiDate(excelPreviewData.statementDate)}
            </p>
            <div className="overflow-x-auto rounded border border-slate-200">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b bg-zinc-50">
                    <th className="p-2">Date</th>
                    <th className="p-2">Invoice</th>
                    <th className="p-2 text-right">Amount</th>
                    <th className="p-2 text-right">Paid</th>
                    <th className="p-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {excelPreviewData.rows.map((r, i) => (
                    <tr key={i} className="border-b border-zinc-100">
                      <td className="p-2 whitespace-nowrap">
                        {formatInvoiceDate(r.issueDate)}
                      </td>
                      <td className="p-2">{r.invoiceNumber}</td>
                      <td className="p-2 text-right tabular-nums">
                        {formatPounds(r.amountGross)}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {formatPounds(r.paidGross)}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {formatPounds(r.balanceGross)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {excelTotals ? (
              <p className="text-sm text-slate-700">
                Total owed:{" "}
                <span className="font-semibold tabular-nums">
                  {formatPounds(excelTotals.totalDue)}
                </span>
                {" · "}
                Total overdue:{" "}
                <span className="font-semibold tabular-nums">
                  {formatPounds(excelTotals.totalOverdue)}
                </span>
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No data.</p>
        )}
      </ReportPreviewDialog>
    </div>
  );
}

export default function StatementsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
      <StatementsInner />
    </Suspense>
  );
}
