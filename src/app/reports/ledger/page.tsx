"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatInvoiceDate, formatUiDate } from "@/lib/format/dates";
import { formatPounds } from "@/lib/format/money";
import {
  buildLedgerCsv,
  type LedgerCsvLine,
} from "@/lib/reports/ledger-csv";
import { usePersistedPageState } from "@/hooks/usePersistedPageState";
import { ReportPreviewDialog } from "@/components/ReportPreviewDialog";

type Customer = { _id: string; name: string };

type Line = LedgerCsvLine;

export default function LedgerPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const initialDraft = useMemo(
    () => ({ customerId: "", from: "", to: "" }),
    []
  );
  const [draft, setDraft] = usePersistedPageState(initialDraft);
  const { customerId, from, to } = draft;
  const [lines, setLines] = useState<Line[]>([]);
  const [openingGross, setOpeningGross] = useState<number | undefined>(
    undefined
  );
  const [loadErr, setLoadErr] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const customerName = useMemo(
    () => customers.find((c) => c._id === customerId)?.name ?? "customer",
    [customers, customerId]
  );

  const excelUrl = useMemo(() => {
    if (!customerId) return "";
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const q = params.toString();
    return `/api/reports/ledger/${customerId}/xlsx${q ? `?${q}` : ""}`;
  }, [customerId, from, to]);

  const pdfUrl = useMemo(() => {
    if (!customerId) return "";
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const q = params.toString();
    return `/api/reports/ledger/${customerId}/pdf${q ? `?${q}` : ""}`;
  }, [customerId, from, to]);

  useEffect(() => {
    fetch("/api/customers", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setCustomers(d);
      });
  }, []);

  // If a previously-selected customer no longer exists in the picker list (e.g. legacy/workspace migration),
  // clear selection so the page looks "empty" rather than showing stale results.
  useEffect(() => {
    if (!customerId) return;
    if (customers.length === 0) return;
    const exists = customers.some((c) => c._id === customerId);
    if (!exists) {
      setDraft((d) => ({ ...d, customerId: "", from: "", to: "" }));
      setLines([]);
      setOpeningGross(undefined);
      setLoadErr("");
    }
  }, [customerId, customers, setDraft]);

  const load = useCallback(async () => {
    setLoadErr("");
    if (!customerId) {
      setLines([]);
      setOpeningGross(undefined);
      return;
    }
    if (from && to && from > to) {
      setLoadErr("From date must be on or before to date.");
      setLines([]);
      setOpeningGross(undefined);
      return;
    }
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const q = params.toString();
    const r = await fetch(
      `/api/reports/ledger/${customerId}${q ? `?${q}` : ""}`,
      { cache: "no-store" }
    );
    const d = await r.json();
    if (!r.ok) {
      setLoadErr(d.error ?? "Could not load ledger");
      setLines([]);
      setOpeningGross(undefined);
      return;
    }
    setLines(Array.isArray(d.lines) ? d.lines : []);
    setOpeningGross(
      typeof d.openingGross === "number" ? d.openingGross : undefined
    );
  }, [customerId, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportReady = !!customerId && !loadErr;

  function downloadCsv() {
    if (!exportReady) return;
    const csv = buildLedgerCsv(customerName, lines, formatPounds, {
      from: from || undefined,
      to: to || undefined,
      openingGross:
        from && openingGross !== undefined ? openingGross : undefined,
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customer-activity-${customerName.replace(/[^\w\-]+/g, "_").slice(0, 80)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Customer ledger</h1>
      <p className="text-sm text-slate-600">
        Optional date range filters rows by invoice issue date or payment receipt
        date. When <strong>From</strong> is set, the running balance starts from
        the opening position before that date. Preview matches CSV / Excel.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm font-medium text-slate-800">
          Customer
          <select
            className="rounded border px-2 py-2 text-sm"
            value={customerId}
            onChange={(e) =>
              setDraft((d) => ({ ...d, customerId: e.target.value }))
            }
          >
            <option value="">Customer…</option>
            {!customers.some((c) => c._id === customerId) && customerId ? (
              <option value={customerId}>Unknown customer (stale)</option>
            ) : null}
            {customers.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-800">
          From
          <input
            type="date"
            className="rounded border px-2 py-2 text-sm"
            value={from}
            onChange={(e) =>
              setDraft((d) => ({ ...d, from: e.target.value }))
            }
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-800">
          To
          <input
            type="date"
            className="rounded border px-2 py-2 text-sm"
            value={to}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
          />
        </label>
        <button
          type="button"
          disabled={!exportReady}
          onClick={() => setPreviewOpen(true)}
          className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-50"
        >
          Preview
        </button>
        <button
          type="button"
          disabled={!exportReady}
          onClick={downloadCsv}
          className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-50"
        >
          Download CSV
        </button>
        <a
          href={exportReady ? excelUrl : undefined}
          aria-disabled={!exportReady}
          className={`inline-flex rounded border border-slate-300 px-3 py-2 text-sm font-medium ${
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
          className={`inline-flex rounded border border-slate-300 px-3 py-2 text-sm font-medium ${
            exportReady
              ? "bg-white text-slate-900 hover:bg-slate-50"
              : "pointer-events-none cursor-not-allowed bg-slate-100 text-slate-500"
          }`}
        >
          Download PDF
        </a>
      </div>
      {loadErr ? (
        <p className="text-sm text-red-600">{loadErr}</p>
      ) : null}
      {customerId && from ? (
        <p className="text-sm text-slate-700">
          Opening balance before {formatUiDate(from)}:{" "}
          <span className="font-medium tabular-nums">
            {formatPounds(openingGross ?? 0)}
          </span>
        </p>
      ) : null}
      <div className="overflow-x-auto rounded border bg-white text-sm shadow-sm">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="border-b bg-zinc-50 text-left">
              <th className="p-2">Date</th>
              <th className="p-2">Type</th>
              <th className="p-2">Ref</th>
              <th className="p-2 text-right">Net (£)</th>
              <th className="p-2 text-right">VAT (£)</th>
              <th className="p-2 text-right">Gross / Pay (£)</th>
              <th className="p-2 text-right">Running (£)</th>
              <th className="p-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {customerId && lines.length === 0 && !loadErr ? (
              <tr>
                <td
                  colSpan={8}
                  className="p-6 text-center text-slate-500"
                >
                  No activity in this date range.
                </td>
              </tr>
            ) : null}
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-zinc-100">
                <td className="p-2 whitespace-nowrap">
                  {l.kind === "invoice" ? formatInvoiceDate(l.date) : formatUiDate(l.date)}
                </td>
                <td className="p-2">{l.kind}</td>
                <td className="p-2">{l.ref}</td>
                <td className="p-2 text-right tabular-nums">
                  {l.kind === "invoice" ? formatPounds(l.net) : "—"}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {l.kind === "invoice" ? formatPounds(l.vat) : "—"}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {l.kind === "invoice"
                    ? formatPounds(l.gross)
                    : formatPounds(-l.amount)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatPounds(l.runningGross)}
                </td>
                <td className="p-2">
                  {l.kind === "invoice" && "invoiceId" in l && l.invoiceId ? (
                    <Link
                      href={`/invoices/${l.invoiceId}/review`}
                      className="font-medium text-neutral-800 hover:underline"
                    >
                      Edit invoice
                    </Link>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ReportPreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Customer activity — export preview"
      >
        {from ? (
          <p className="mb-2 text-sm text-slate-700">
            Opening balance before {formatUiDate(from)}:{" "}
            <span className="font-medium tabular-nums">
              {formatPounds(openingGross ?? 0)}
            </span>
          </p>
        ) : null}
        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-zinc-50 text-left">
                <th className="p-2">Date</th>
                <th className="p-2">Type</th>
                <th className="p-2">Ref</th>
                <th className="p-2 text-right">Net (£)</th>
                <th className="p-2 text-right">VAT (£)</th>
                <th className="p-2 text-right">Gross / Pay (£)</th>
                <th className="p-2 text-right">Running (£)</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-slate-500">
                    No rows in range (file still includes headers and opening
                    line in Excel / CSV).
                  </td>
                </tr>
              ) : (
                lines.map((l, i) => (
                  <tr key={i} className="border-b border-zinc-100">
                    <td className="p-2 whitespace-nowrap">
                  {l.kind === "invoice" ? formatInvoiceDate(l.date) : formatUiDate(l.date)}
                </td>
                    <td className="p-2">{l.kind}</td>
                    <td className="p-2">{l.ref}</td>
                    <td className="p-2 text-right tabular-nums">
                      {l.kind === "invoice" ? formatPounds(l.net) : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {l.kind === "invoice" ? formatPounds(l.vat) : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {l.kind === "invoice"
                        ? formatPounds(l.gross)
                        : formatPounds(-l.amount)}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatPounds(l.runningGross)}
                    </td>
                    <td className="p-2">
                      {l.kind === "invoice" && "invoiceId" in l && l.invoiceId ? (
                        <Link
                          href={`/invoices/${l.invoiceId}/review`}
                          className="font-medium text-neutral-800 hover:underline"
                        >
                          Edit invoice
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </ReportPreviewDialog>
    </div>
  );
}
