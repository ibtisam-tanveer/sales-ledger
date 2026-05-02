"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { parseISO } from "date-fns";
import { formatInvoiceDate, formatUiDate } from "@/lib/format/dates";
import { statementAttachmentFilename } from "@/lib/format/download-filename";
import { formatPounds } from "@/lib/format/money";
import { usePersistedPageState } from "@/hooks/usePersistedPageState";
import { computeStatementTotals } from "@/lib/statements/statement-math";
import type { StatementRow } from "@/lib/statement-pdf/statement-document";
import { ReportPreviewDialog } from "@/components/ReportPreviewDialog";
import { selectDateInputOnFocus } from "@/lib/ui/date-input-focus";
import { TablePagination } from "@/components/TablePagination";

const ALL_CUSTOMERS_VALUE = "__all__";

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
  const [pdfPreviewNonce, setPdfPreviewNonce] = useState(0);
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
  const [excelPage, setExcelPage] = useState(1);
  const [excelPageSize, setExcelPageSize] = useState(3);
  const [bulkDownloading, setBulkDownloading] = useState(false);

  const isAllCustomers = customerId === ALL_CUSTOMERS_VALUE;
  const hasSelection = Boolean(customerId);

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
    if (!customerId || isAllCustomers) return "";
    return `/api/statements/${customerId}/pdf?asOf=${encodeURIComponent(asOf)}&mode=inline&nonce=${pdfPreviewNonce}`;
  }, [customerId, isAllCustomers, asOf, pdfPreviewNonce]);

  const pdfDownloadUrl = useMemo(() => {
    if (!customerId || isAllCustomers) return "";
    return `/api/statements/${customerId}/pdf?asOf=${encodeURIComponent(asOf)}`;
  }, [customerId, isAllCustomers, asOf]);

  const excelUrl = useMemo(() => {
    if (!customerId || isAllCustomers) return "";
    return `/api/statements/${customerId}/xlsx?asOf=${encodeURIComponent(asOf)}`;
  }, [customerId, isAllCustomers, asOf]);

  function scrollToPdfPreview() {
    setPdfPreviewNonce((n) => n + 1);
    document
      .getElementById("statement-pdf-preview")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function openExcelPreview() {
    if (!customerId || isAllCustomers) return;
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

  useEffect(() => {
    setExcelPage(1);
  }, [excelPreviewOpen, excelPreviewData]);

  const excelTotalPages = Math.max(
    1,
    Math.ceil((excelPreviewData?.rows.length ?? 0) / Math.max(1, excelPageSize))
  );
  const safeExcelPage = Math.min(Math.max(1, excelPage), excelTotalPages);
  const pagedExcelRows = useMemo(() => {
    const rows = excelPreviewData?.rows ?? [];
    const start = (safeExcelPage - 1) * excelPageSize;
    return rows.slice(start, start + excelPageSize);
  }, [excelPreviewData, safeExcelPage, excelPageSize]);

  const statementDateForFilename = useMemo(() => parseISO(asOf), [asOf]);

  function triggerBrowserDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadStatementsForAllCustomers(format: "pdf" | "xlsx") {
    setBulkDownloading(true);
    try {
      const elR = await fetch(
        `/api/statements/bulk-eligible?asOf=${encodeURIComponent(asOf)}`,
        { cache: "no-store" }
      );
      const elD = (await elR.json()) as {
        customers?: { customerId: string; name: string }[];
        error?: string;
      };
      if (!elR.ok) {
        window.alert(elD.error ?? "Could not load customer list.");
        return;
      }
      const list = elD.customers ?? [];
      if (list.length === 0) {
        window.alert(
          "No customers have a non-zero statement balance for this date. Nothing to download."
        );
        return;
      }
      const ext = format === "pdf" ? "pdf" : "xlsx";
      for (const c of list) {
        const url = `/api/statements/${c.customerId}/${ext}?asOf=${encodeURIComponent(asOf)}`;
        const fileR = await fetch(url, { cache: "no-store" });
        if (!fileR.ok) {
          const err = await fileR.json().catch(() => ({}));
          console.error(err);
          continue;
        }
        const blob = await fileR.blob();
        const filename = statementAttachmentFilename(c.name, statementDateForFilename, ext);
        triggerBrowserDownload(blob, filename);
        await new Promise((r) => setTimeout(r, 350));
      }
    } finally {
      setBulkDownloading(false);
    }
  }

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
      <p className="text-sm text-slate-600">
        Choose <strong>All customers</strong> to download one file per customer. For all
        customers, only statements with a <strong>non-zero balance</strong> are included.
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
            <option value={ALL_CUSTOMERS_VALUE}>All customers (non-zero balance only)</option>
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
            disabled={!hasSelection || isAllCustomers}
            onClick={scrollToPdfPreview}
            className={`inline-flex rounded border border-slate-300 px-4 py-2 text-sm font-medium ${
              hasSelection && !isAllCustomers
                ? "bg-white text-slate-900 hover:bg-slate-50"
                : "cursor-not-allowed bg-slate-100 text-slate-500"
            }`}
          >
            Preview PDF
          </button>
          <button
            type="button"
            disabled={!hasSelection || isAllCustomers || excelPreviewLoading}
            onClick={() => void openExcelPreview()}
            className={`inline-flex rounded border border-slate-300 px-4 py-2 text-sm font-medium ${
              hasSelection && !isAllCustomers
                ? "bg-white text-slate-900 hover:bg-slate-50"
                : "cursor-not-allowed bg-slate-100 text-slate-500"
            }`}
          >
            {excelPreviewLoading ? "Loading…" : "Preview Excel"}
          </button>
          {isAllCustomers ? (
            <button
              type="button"
              disabled={!hasSelection || bulkDownloading}
              onClick={() => void downloadStatementsForAllCustomers("pdf")}
              className={`inline-flex rounded px-4 py-2 text-sm font-medium text-white ${
                hasSelection && !bulkDownloading
                  ? "bg-zinc-900 hover:bg-zinc-800"
                  : "cursor-not-allowed bg-zinc-400"
              }`}
            >
              {bulkDownloading ? "Downloading…" : "Download PDF"}
            </button>
          ) : (
            <a
              href={pdfDownloadUrl || "#"}
              aria-disabled={!hasSelection}
              className={`inline-flex rounded px-4 py-2 text-sm font-medium text-white ${
                hasSelection
                  ? "bg-zinc-900 hover:bg-zinc-800"
                  : "cursor-not-allowed bg-zinc-400 pointer-events-none"
              }`}
            >
              Download PDF
            </a>
          )}
          {isAllCustomers ? (
            <button
              type="button"
              disabled={!hasSelection || bulkDownloading}
              onClick={() => void downloadStatementsForAllCustomers("xlsx")}
              className={`inline-flex rounded border border-slate-300 px-4 py-2 text-sm font-medium ${
                hasSelection && !bulkDownloading
                  ? "bg-white text-slate-900 hover:bg-slate-50"
                  : "cursor-not-allowed bg-slate-100 text-slate-500"
              }`}
            >
              {bulkDownloading ? "Downloading…" : "Download Excel"}
            </button>
          ) : (
            <a
              href={excelUrl || "#"}
              aria-disabled={!hasSelection}
              className={`inline-flex rounded border border-slate-300 px-4 py-2 text-sm font-medium ${
                hasSelection
                  ? "bg-white text-slate-900 hover:bg-slate-50"
                  : "cursor-not-allowed bg-slate-100 text-slate-500 pointer-events-none"
              }`}
            >
              Download Excel
            </a>
          )}
        </div>
      </div>

      <div
        id="statement-pdf-preview"
        className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm scroll-mt-4"
      >
        <div className="border-b border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
          Preview (PDF)
        </div>
        {!hasSelection ? (
          <p className="p-8 text-center text-sm text-slate-500">Select a customer to preview.</p>
        ) : isAllCustomers ? (
          <p className="p-8 text-center text-sm text-slate-600">
            PDF preview is available for a single customer. Use download for all customers.
          </p>
        ) : (
          <iframe
            key={`${customerId}-${asOf}-${pdfPreviewNonce}`}
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
                  {pagedExcelRows.map((r, i) => (
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

            <TablePagination
              total={excelPreviewData.rows.length}
              page={safeExcelPage}
              pageSize={excelPageSize}
              itemLabel="rows"
              onPage={setExcelPage}
              onPageSize={(s) => {
                setExcelPage(1);
                setExcelPageSize(s);
              }}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm"
            />
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
