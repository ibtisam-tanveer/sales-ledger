"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { formatInvoiceDate, formatUiDate } from "@/lib/format/dates";
import { formatPounds } from "@/lib/format/money";
import {
  buildLedgerCsv,
  type LedgerCsvLine,
} from "@/lib/reports/ledger-csv";
import { usePersistedPageState } from "@/hooks/usePersistedPageState";
import { ReportPreviewDialog } from "@/components/ReportPreviewDialog";
import { selectDateInputOnFocus } from "@/lib/ui/date-input-focus";

type Customer = { _id: string; name: string };

/** Matches API `computeLedgerReport` lines (includes `remittanceId` for payments). */
type Line =
  | {
      kind: "invoice";
      date: string;
      ref: string;
      net: number;
      vat: number;
      gross: number;
      runningGross: number;
      invoiceId: string;
    }
  | {
      kind: "payment";
      date: string;
      ref: string;
      amount: number;
      runningGross: number;
      remittanceId: string;
    };

type LedgerSortKey =
  | "date"
  | "type"
  | "ref"
  | "net"
  | "vat"
  | "grossPay"
  | "running";

function LedgerSortableTh(props: {
  label: string;
  sortKeyName: LedgerSortKey;
  activeKey: LedgerSortKey;
  sortDir: "asc" | "desc";
  onSort: (key: LedgerSortKey) => void;
  align?: "left" | "right";
  filter?: ReactNode;
}) {
  const {
    label,
    sortKeyName,
    activeKey,
    sortDir,
    onSort,
    align = "left",
    filter,
  } = props;
  const active = activeKey === sortKeyName;
  return (
    <th
      className={`align-top p-2 ${align === "right" ? "text-right" : "text-left"}`}
      aria-sort={
        active ? (sortDir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <div
        className={`flex min-w-0 flex-col gap-1 ${align === "right" ? "items-end" : "items-stretch"}`}
      >
        <button
          type="button"
          onClick={() => onSort(sortKeyName)}
          className={`inline-flex items-center gap-1 rounded px-0.5 py-0.5 font-medium hover:bg-zinc-200/80 ${
            align === "right" ? "self-end" : ""
          }`}
        >
          {label}
          <span className="font-normal text-slate-500" aria-hidden>
            {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
          </span>
        </button>
        {filter ? (
          <div
            className={`w-full min-w-0 ${align === "right" ? "flex justify-end" : ""}`}
          >
            {filter}
          </div>
        ) : null}
      </div>
    </th>
  );
}

function lineNetSort(l: Line): number {
  return l.kind === "invoice" ? l.net : 0;
}
function lineVatSort(l: Line): number {
  return l.kind === "invoice" ? l.vat : 0;
}
function lineGrossPaySort(l: Line): number {
  return l.kind === "invoice" ? l.gross : -l.amount;
}

function LedgerPageInner() {
  const searchParams = useSearchParams();
  const preCustomerId = searchParams.get("customerId") ?? "";

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
  const [sortKey, setSortKey] = useState<LedgerSortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [lineKindFilter, setLineKindFilter] = useState<"all" | "invoice" | "payment">(
    "all"
  );
  const [refContains, setRefContains] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

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

  useEffect(() => {
    if (preCustomerId) {
      setDraft((d) => ({ ...d, customerId: preCustomerId }));
    }
  }, [preCustomerId, setDraft]);

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
    setLines(Array.isArray(d.lines) ? (d.lines as Line[]) : []);
    setOpeningGross(
      typeof d.openingGross === "number" ? d.openingGross : undefined
    );
  }, [customerId, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const chronologicalOrder =
    sortKey === "date" && sortDir === "asc";

  const viewLines = useMemo(() => {
    let v = lines;
    if (lineKindFilter === "invoice") {
      v = v.filter((l) => l.kind === "invoice");
    } else if (lineKindFilter === "payment") {
      v = v.filter((l) => l.kind === "payment");
    }
    const q = refContains.trim().toLowerCase();
    if (q) v = v.filter((l) => l.ref.toLowerCase().includes(q));
    return v;
  }, [lines, lineKindFilter, refContains]);

  const displayLines = useMemo(() => {
    const rows = [...viewLines];
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "date":
          cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case "type":
          cmp = a.kind.localeCompare(b.kind);
          break;
        case "ref":
          cmp = a.ref.localeCompare(b.ref, undefined, { numeric: true });
          break;
        case "net":
          cmp = lineNetSort(a) - lineNetSort(b);
          break;
        case "vat":
          cmp = lineVatSort(a) - lineVatSort(b);
          break;
        case "grossPay":
          cmp = lineGrossPaySort(a) - lineGrossPaySort(b);
          break;
        case "running":
          cmp = a.runningGross - b.runningGross;
          break;
        default:
          break;
      }
      return cmp * dir;
    });
    return rows;
  }, [viewLines, sortKey, sortDir]);

  function cycleLedgerSort(key: LedgerSortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    setSortDir((d) => (d === "asc" ? "desc" : "asc"));
  }

  function rowKey(l: Line): string {
    return l.kind === "invoice" ? `inv-${l.invoiceId}` : `pay-${l.remittanceId}`;
  }

  async function deleteLedgerInvoice(invoiceId: string, ref: string) {
    setActionErr("");
    const ok = window.confirm(
      `Delete posted invoice ${ref}?\n\n` +
        `This will remove any payment allocations on this invoice and return that cash to the receipt as unapplied.\n` +
        `This cannot be undone.`
    );
    if (!ok) return;
    setBusyKey(`inv-${invoiceId}`);
    try {
      const r = await fetch(`/api/invoices/${invoiceId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setActionErr(typeof d.error === "string" ? d.error : "Could not delete invoice");
        return;
      }
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteLedgerPayment(remittanceId: string, ref: string) {
    setActionErr("");
    const ok = window.confirm(
      `Remove receipt / payment ${ref || remittanceId}?\n\n` +
        `Allocations to invoices will be reversed. This cannot be undone.`
    );
    if (!ok) return;
    setBusyKey(`pay-${remittanceId}`);
    try {
      const r = await fetch(`/api/remittances/${remittanceId}`, {
        method: "DELETE",
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setActionErr(typeof d.error === "string" ? d.error : "Could not remove receipt");
        return;
      }
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  const exportReady = !!customerId && !loadErr;

  function downloadCsv() {
    if (!exportReady) return;
    const csvLines: LedgerCsvLine[] = lines.map((l) =>
      l.kind === "invoice"
        ? {
            kind: "invoice",
            date: l.date,
            ref: l.ref,
            net: l.net,
            vat: l.vat,
            gross: l.gross,
            runningGross: l.runningGross,
            invoiceId: l.invoiceId,
          }
        : {
            kind: "payment",
            date: l.date,
            ref: l.ref,
            amount: l.amount,
            runningGross: l.runningGross,
          }
    );
    const csv = buildLedgerCsv(customerName, csvLines, formatPounds, {
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
            onFocus={selectDateInputOnFocus}
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
            onFocus={selectDateInputOnFocus}
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
      {actionErr ? (
        <p className="text-sm text-red-600" role="alert">
          {actionErr}
        </p>
      ) : null}
      {!chronologicalOrder && viewLines.length > 0 ? (
        <p className="text-sm text-amber-800">
          Running (£) is calculated in date order. Sort by <strong>Date</strong> ascending (↑)
          to match the running balance column.
        </p>
      ) : null}
      {customerId && from ? (
        <p className="text-sm text-slate-700">
          Opening balance before {formatUiDate(from)}:{" "}
          <span className="font-medium tabular-nums">
            {formatPounds(openingGross ?? 0)}
          </span>
        </p>
      ) : null}
      {customerId ? (
        <p className="text-xs text-slate-500">
          Use the <strong>Type</strong> and <strong>Ref</strong> controls under those column
          headers to filter this table and preview. Exports still use the full date range.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded border bg-white text-sm shadow-sm">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="border-b bg-zinc-50 text-left">
              <LedgerSortableTh
                label="Date"
                sortKeyName="date"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={cycleLedgerSort}
              />
              <LedgerSortableTh
                label="Type"
                sortKeyName="type"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={cycleLedgerSort}
                filter={
                  <>
                    <label className="sr-only" htmlFor="ledger-filter-type">
                      Filter by row type
                    </label>
                    <select
                      id="ledger-filter-type"
                      disabled={!customerId}
                      className="w-full max-w-[9.5rem] rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px] text-slate-900 disabled:cursor-not-allowed disabled:opacity-45"
                      value={lineKindFilter}
                      onChange={(e) =>
                        setLineKindFilter(
                          e.target.value as "all" | "invoice" | "payment"
                        )
                      }
                    >
                      <option value="all">All types</option>
                      <option value="invoice">Invoices only</option>
                      <option value="payment">Payments only</option>
                    </select>
                  </>
                }
              />
              <LedgerSortableTh
                label="Ref"
                sortKeyName="ref"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={cycleLedgerSort}
                filter={
                  <>
                    <label className="sr-only" htmlFor="ledger-filter-ref">
                      Filter ref contains
                    </label>
                    <input
                      id="ledger-filter-ref"
                      type="search"
                      disabled={!customerId}
                      placeholder="Contains…"
                      className="w-full max-w-[11rem] min-w-0 rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px] text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-45"
                      value={refContains}
                      onChange={(e) => setRefContains(e.target.value)}
                    />
                  </>
                }
              />
              <LedgerSortableTh
                label="Net (£)"
                sortKeyName="net"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={cycleLedgerSort}
                align="right"
              />
              <LedgerSortableTh
                label="VAT (£)"
                sortKeyName="vat"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={cycleLedgerSort}
                align="right"
              />
              <LedgerSortableTh
                label="Gross / Pay (£)"
                sortKeyName="grossPay"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={cycleLedgerSort}
                align="right"
              />
              <LedgerSortableTh
                label="Running (£)"
                sortKeyName="running"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={cycleLedgerSort}
                align="right"
              />
              <th className="align-top p-2 text-left">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium">Action</span>
                  <button
                    type="button"
                    disabled={
                      !customerId ||
                      (lineKindFilter === "all" && !refContains.trim())
                    }
                    className="text-left text-[10px] font-medium text-slate-700 underline decoration-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40"
                    onClick={() => {
                      setLineKindFilter("all");
                      setRefContains("");
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              </th>
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
            {customerId && lines.length > 0 && viewLines.length === 0 && !loadErr ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-500">
                  No rows match the current table filters.
                </td>
              </tr>
            ) : null}
            {displayLines.map((l) => (
              <tr key={rowKey(l)} className="border-b border-zinc-100">
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
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {l.kind === "invoice" ? (
                      <>
                        <Link
                          href={`/invoices/${l.invoiceId}/review`}
                          className="font-medium text-neutral-800 hover:underline"
                        >
                          Edit invoice
                        </Link>
                        <button
                          type="button"
                          disabled={busyKey === `inv-${l.invoiceId}`}
                          onClick={() => void deleteLedgerInvoice(l.invoiceId, l.ref)}
                          className="font-medium text-red-700 hover:underline disabled:opacity-50"
                        >
                          {busyKey === `inv-${l.invoiceId}` ? "Deleting…" : "Delete"}
                        </button>
                      </>
                    ) : (
                      <>
                        <Link
                          href="/bank/activity"
                          className="font-medium text-neutral-800 hover:underline"
                        >
                          Bank activity
                        </Link>
                        <button
                          type="button"
                          disabled={busyKey === `pay-${l.remittanceId}`}
                          onClick={() =>
                            void deleteLedgerPayment(l.remittanceId, l.ref)
                          }
                          className="font-medium text-red-700 hover:underline disabled:opacity-50"
                        >
                          {busyKey === `pay-${l.remittanceId}` ? "Removing…" : "Delete"}
                        </button>
                      </>
                    )}
                  </div>
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
        {!chronologicalOrder && viewLines.length > 0 ? (
          <p className="mb-2 text-sm text-amber-800">
            Running (£) is calculated in date order. Sort by Date ascending to match
            balances.
          </p>
        ) : null}
        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-zinc-50 text-left">
                <LedgerSortableTh
                  label="Date"
                  sortKeyName="date"
                  activeKey={sortKey}
                  sortDir={sortDir}
                  onSort={cycleLedgerSort}
                />
                <LedgerSortableTh
                  label="Type"
                  sortKeyName="type"
                  activeKey={sortKey}
                  sortDir={sortDir}
                  onSort={cycleLedgerSort}
                  filter={
                    <>
                      <label className="sr-only" htmlFor="ledger-preview-filter-type">
                        Filter by row type
                      </label>
                      <select
                        id="ledger-preview-filter-type"
                        disabled={!customerId}
                        className="w-full max-w-[9.5rem] rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px] text-slate-900 disabled:cursor-not-allowed disabled:opacity-45"
                        value={lineKindFilter}
                        onChange={(e) =>
                          setLineKindFilter(
                            e.target.value as "all" | "invoice" | "payment"
                          )
                        }
                      >
                        <option value="all">All types</option>
                        <option value="invoice">Invoices only</option>
                        <option value="payment">Payments only</option>
                      </select>
                    </>
                  }
                />
                <LedgerSortableTh
                  label="Ref"
                  sortKeyName="ref"
                  activeKey={sortKey}
                  sortDir={sortDir}
                  onSort={cycleLedgerSort}
                  filter={
                    <>
                      <label className="sr-only" htmlFor="ledger-preview-filter-ref">
                        Filter ref contains
                      </label>
                      <input
                        id="ledger-preview-filter-ref"
                        type="search"
                        disabled={!customerId}
                        placeholder="Contains…"
                        className="w-full max-w-[11rem] min-w-0 rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px] text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-45"
                        value={refContains}
                        onChange={(e) => setRefContains(e.target.value)}
                      />
                    </>
                  }
                />
                <LedgerSortableTh
                  label="Net (£)"
                  sortKeyName="net"
                  activeKey={sortKey}
                  sortDir={sortDir}
                  onSort={cycleLedgerSort}
                  align="right"
                />
                <LedgerSortableTh
                  label="VAT (£)"
                  sortKeyName="vat"
                  activeKey={sortKey}
                  sortDir={sortDir}
                  onSort={cycleLedgerSort}
                  align="right"
                />
                <LedgerSortableTh
                  label="Gross / Pay (£)"
                  sortKeyName="grossPay"
                  activeKey={sortKey}
                  sortDir={sortDir}
                  onSort={cycleLedgerSort}
                  align="right"
                />
                <LedgerSortableTh
                  label="Running (£)"
                  sortKeyName="running"
                  activeKey={sortKey}
                  sortDir={sortDir}
                  onSort={cycleLedgerSort}
                  align="right"
                />
                <th className="align-top p-2 text-left">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="font-medium">Action</span>
                    <button
                      type="button"
                      disabled={
                        !customerId ||
                        (lineKindFilter === "all" && !refContains.trim())
                      }
                      className="text-left text-[10px] font-medium text-slate-700 underline decoration-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40"
                      onClick={() => {
                        setLineKindFilter("all");
                        setRefContains("");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                </th>
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
              ) : viewLines.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-slate-500">
                    No rows match the current table filters.
                  </td>
                </tr>
              ) : (
                displayLines.map((l) => (
                  <tr key={`pv-${rowKey(l)}`} className="border-b border-zinc-100">
                    <td className="p-2 whitespace-nowrap">
                      {l.kind === "invoice"
                        ? formatInvoiceDate(l.date)
                        : formatUiDate(l.date)}
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
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {l.kind === "invoice" ? (
                          <>
                            <Link
                              href={`/invoices/${l.invoiceId}/review`}
                              className="font-medium text-neutral-800 hover:underline"
                            >
                              Edit invoice
                            </Link>
                            <button
                              type="button"
                              disabled={busyKey === `inv-${l.invoiceId}`}
                              onClick={() =>
                                void deleteLedgerInvoice(l.invoiceId, l.ref)
                              }
                              className="font-medium text-red-700 hover:underline disabled:opacity-50"
                            >
                              {busyKey === `inv-${l.invoiceId}`
                                ? "Deleting…"
                                : "Delete"}
                            </button>
                          </>
                        ) : (
                          <>
                            <Link
                              href="/bank/activity"
                              className="font-medium text-neutral-800 hover:underline"
                            >
                              Bank activity
                            </Link>
                            <button
                              type="button"
                              disabled={busyKey === `pay-${l.remittanceId}`}
                              onClick={() =>
                                void deleteLedgerPayment(l.remittanceId, l.ref)
                              }
                              className="font-medium text-red-700 hover:underline disabled:opacity-50"
                            >
                              {busyKey === `pay-${l.remittanceId}`
                                ? "Removing…"
                                : "Delete"}
                            </button>
                          </>
                        )}
                      </div>
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

export default function LedgerPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <LedgerPageInner />
    </Suspense>
  );
}
