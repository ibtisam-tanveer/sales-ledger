"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatInvoiceDate, formatUiDate } from "@/lib/format/dates";
import { formatPounds } from "@/lib/format/money";
import { usePersistedPageState } from "@/hooks/usePersistedPageState";
import { buildVatCsv } from "@/lib/reports/vat-csv";
import type { VatReportRow } from "@/lib/reports/vat-report";
import { ReportPreviewDialog } from "@/components/ReportPreviewDialog";
import { selectDateInputOnFocus } from "@/lib/ui/date-input-focus";

export default function VatReportPage() {
  const initialDraft = useMemo(
    () => ({ from: "", to: "", totalsOnly: false }),
    []
  );
  const [draft, setDraft] = usePersistedPageState(initialDraft);
  const { from, to, totalsOnly } = draft;
  const [rows, setRows] = useState<VatReportRow[]>([]);
  const [totals, setTotals] = useState({ net: 0, vat: 0, gross: 0 });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    setHasRun(false);
  }, [totalsOnly, from, to]);

  async function run() {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    if (totalsOnly) q.set("totalsOnly", "1");
    const r = await fetch(`/api/reports/vat?${q}`);
    const d = await r.json();
    setRows(d.rows ?? []);
    setTotals(d.totals ?? { net: 0, vat: 0, gross: 0 });
    setHasRun(true);
  }

  const excelUrl = useMemo(() => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    if (totalsOnly) q.set("totalsOnly", "1");
    const s = q.toString();
    return `/api/reports/vat/xlsx${s ? `?${s}` : ""}`;
  }, [from, to, totalsOnly]);

  const pdfUrl = useMemo(() => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    if (totalsOnly) q.set("totalsOnly", "1");
    const s = q.toString();
    return `/api/reports/vat/pdf${s ? `?${s}` : ""}`;
  }, [from, to, totalsOnly]);

  function downloadCsv() {
    if (!hasRun) return;
    const csv = buildVatCsv(rows, totals, {
      from: from || undefined,
      to: to || undefined,
      totalsOnly,
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vat-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const exportReady = hasRun;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">VAT report</h1>
      <p className="text-sm text-slate-600">
        Run for a date range, then preview or download.{" "}
        <strong>Totals only</strong> omits invoice lines in the table and in CSV /
        Excel (figures still match all qualifying invoices).
      </p>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="grid gap-1 font-medium text-slate-800">
          From
          <input
            type="date"
            className="rounded border px-2 py-1"
            value={from}
            onFocus={selectDateInputOnFocus}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
          />
        </label>
        <label className="grid gap-1 font-medium text-slate-800">
          To
          <input
            type="date"
            className="rounded border px-2 py-1"
            value={to}
            onFocus={selectDateInputOnFocus}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
          />
        </label>
        <label className="flex items-center gap-2 font-medium text-slate-800">
          <input
            type="checkbox"
            checked={totalsOnly}
            onChange={(e) =>
              setDraft((d) => ({ ...d, totalsOnly: e.target.checked }))
            }
          />
          Totals only
        </label>
        <button
          type="button"
          onClick={run}
          className="rounded bg-zinc-900 px-3 py-2 text-white"
        >
          Run
        </button>
        <button
          type="button"
          disabled={!exportReady}
          onClick={() => setPreviewOpen(true)}
          className="rounded border border-slate-300 bg-white px-3 py-2 font-medium text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-50"
        >
          Preview
        </button>
        <button
          type="button"
          disabled={!exportReady}
          onClick={downloadCsv}
          className="rounded border border-slate-300 bg-white px-3 py-2 font-medium text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-50"
        >
          Download CSV
        </button>
        <a
          href={exportReady ? excelUrl : undefined}
          aria-disabled={!exportReady}
          className={`inline-flex rounded border border-slate-300 px-3 py-2 font-medium ${
            exportReady
              ? "bg-white text-slate-900 hover:bg-slate-50"
              : "pointer-events-none cursor-not-allowed bg-slate-100 text-slate-500"
          }`}
        >
          Download Excel
        </a>
        <a
          href={exportReady ? pdfUrl : undefined}
          aria-disabled={!exportReady}
          className={`inline-flex rounded border border-slate-300 px-3 py-2 font-medium ${
            exportReady
              ? "bg-white text-slate-900 hover:bg-slate-50"
              : "pointer-events-none cursor-not-allowed bg-slate-100 text-slate-500"
          }`}
        >
          Download PDF
        </a>
      </div>
      <p className="text-sm text-slate-700">
        Totals — Net: {formatPounds(totals.net)} | VAT: {formatPounds(totals.vat)}{" "}
        | Gross: {formatPounds(totals.gross)}
      </p>
      <div className="overflow-x-auto rounded border bg-white text-sm shadow-sm">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="border-b bg-zinc-50 text-left">
              <th className="p-2">Date</th>
              <th className="p-2">Invoice</th>
              <th className="p-2 text-right">Net (£)</th>
              <th className="p-2 text-right">VAT (£)</th>
              <th className="p-2 text-right">Gross (£)</th>
              <th className="p-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id} className="border-b border-zinc-100">
                <td className="p-2 whitespace-nowrap">{formatInvoiceDate(r.issueDate)}</td>
                <td className="p-2">{r.invoiceNumber}</td>
                <td className="p-2 text-right tabular-nums">
                  {formatPounds(r.amountNet)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatPounds(r.amountVat)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatPounds(r.amountGross)}
                </td>
                <td className="p-2">
                  <Link
                    href={`/invoices/${r._id}/review`}
                    className="font-medium text-neutral-800 hover:underline"
                  >
                    Edit invoice
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-200 bg-zinc-100 font-medium">
              <td className="p-2" colSpan={2}>
                Total
              </td>
              <td className="p-2 text-right tabular-nums">
                {formatPounds(totals.net)}
              </td>
              <td className="p-2 text-right tabular-nums">
                {formatPounds(totals.vat)}
              </td>
              <td className="p-2 text-right tabular-nums">
                {formatPounds(totals.gross)}
              </td>
              <td className="p-2" />
            </tr>
          </tfoot>
        </table>
      </div>

      <ReportPreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="VAT report — export preview"
      >
        <p className="mb-3 text-xs text-slate-500">
          {totalsOnly
            ? "Totals only: summary matches CSV / Excel."
            : "Same layout as CSV / Excel (plus total row)."}
        </p>
        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-zinc-50 text-left">
                <th className="p-2">Date</th>
                <th className="p-2">Invoice</th>
                <th className="p-2 text-right">Net (£)</th>
                <th className="p-2 text-right">VAT (£)</th>
                <th className="p-2 text-right">Gross (£)</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="border-b border-zinc-100">
                  <td className="p-2 whitespace-nowrap">
                    {formatInvoiceDate(r.issueDate)}
                  </td>
                  <td className="p-2">{r.invoiceNumber}</td>
                  <td className="p-2 text-right tabular-nums">
                    {formatPounds(r.amountNet)}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatPounds(r.amountVat)}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatPounds(r.amountGross)}
                  </td>
                  <td className="p-2">
                    <Link
                      href={`/invoices/${r._id}/review`}
                      className="font-medium text-neutral-800 hover:underline"
                    >
                      Edit invoice
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-zinc-100 font-medium">
                <td className="p-2" colSpan={2}>
                  Total
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatPounds(totals.net)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatPounds(totals.vat)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatPounds(totals.gross)}
                </td>
                <td className="p-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      </ReportPreviewDialog>
    </div>
  );
}
