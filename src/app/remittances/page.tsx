"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatInvoiceDate, formatUiDate } from "@/lib/format/dates";
import { formatAmountForInput, formatPounds, parseAmountInput } from "@/lib/format/money";
import { usePersistedPageState } from "@/hooks/usePersistedPageState";

type Customer = { _id: string; name: string };
type Bank = { accountLabel: string; bankName: string };

type InvRow = {
  _id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  siteAddress: string;
  poNumber: string;
  amountGross: number;
  paidGross: number;
  balanceGross: number;
  status: string;
};

export default function RemittancesPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bank, setBank] = useState<Bank | null>(null);
  const defaultDraft = useMemo(
    () => ({
      customerId: "",
      bankAccountKey: "default",
      receivedAt: new Date().toISOString().slice(0, 10),
      amount: "",
      reference: "",
      alloc: {} as Record<string, string>,
    }),
    []
  );
  const [draft, setDraft] = usePersistedPageState(defaultDraft);
  const { customerId, bankAccountKey, receivedAt, amount, reference, alloc } = draft;
  const [rows, setRows] = useState<InvRow[]>([]);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [parseBusy, setParseBusy] = useState(false);
  const [parseNote, setParseNote] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  /** User typed receipt manually; allocations no longer overwrite until they edit an allocation again. */
  const amountManualLock = useRef(false);

  useEffect(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then(setCustomers);
  }, []);

  useEffect(() => {
    fetch("/api/bank-account")
      .then((r) => r.json())
      .then((d) => {
        if (!d?.error) {
          setBank({
            accountLabel: d.accountLabel ?? "",
            bankName: d.bankName ?? "",
          });
        }
      });
  }, []);

  useEffect(() => {
    if (!customerId) {
      setRows([]);
      return;
    }
    fetch(`/api/invoices/open-for-allocation?customerId=${customerId}`)
      .then((r) => r.json())
      .then((data: InvRow[]) => {
        if (Array.isArray(data)) {
          setRows(data);
          amountManualLock.current = false;
          setDraft((d) => ({
            ...d,
            alloc: Object.fromEntries(
              Object.entries(d.alloc).filter(([id]) =>
                data.some((row) => row._id === id)
              )
            ),
          }));
        }
      });
  }, [customerId, setDraft]);

  function setAllocFor(id: string, value: string) {
    amountManualLock.current = false;
    setDraft((d) => ({
      ...d,
      alloc: { ...d.alloc, [id]: value },
    }));
  }

  function fillMaxBalance(id: string, balance: number) {
    setAllocFor(id, balance.toFixed(2));
  }

  async function parseRemittancePdf(file: File) {
    if (!customerId) {
      setErr("Select a customer first.");
      return;
    }
    setParseBusy(true);
    setErr("");
    setParseNote("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("customerId", customerId);
      const r = await fetch("/api/remittances/parse-pdf", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error ?? "Parse failed");
        if (d.textPreview) setParseNote(String(d.textPreview).slice(0, 400));
        return;
      }
      setDraft((prev) => {
        let receivedAtNext = prev.receivedAt;
        if (d.paymentDateIso) {
          const iso = String(d.paymentDateIso).slice(0, 10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) receivedAtNext = iso;
        }
        const nextAlloc: Record<string, string> = { ...prev.alloc };
        for (const a of d.allocations ?? []) {
          if (a.invoiceId && a.amountGross > 0) {
            nextAlloc[a.invoiceId] = formatAmountForInput(a.amountGross);
          }
        }
        const fromPdfTotal =
          typeof d.totalGross === "number"
            ? formatAmountForInput(d.totalGross)
            : null;
        if (fromPdfTotal != null) {
          amountManualLock.current = true;
        } else {
          amountManualLock.current = false;
        }
        return {
          ...prev,
          amount: fromPdfTotal ?? prev.amount,
          reference: d.reference ? String(d.reference) : prev.reference,
          receivedAt: receivedAtNext,
          alloc: nextAlloc,
        };
      });
      const u = (d.unmatched ?? []).length;
      setParseNote(
        u > 0
          ? `${d.allocations?.length ?? 0} line(s) matched. ${u} line(s) could not be matched to open invoices — check manually.`
          : `Filled ${d.allocations?.length ?? 0} allocation line(s) from PDF. Check amounts before saving.`
      );
    } finally {
      setParseBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setOk("");
    const receiptGross = parseAmountInput(amount);
    if (!Number.isFinite(receiptGross) || receiptGross <= 0) {
      setErr("Enter a valid receipt amount greater than zero.");
      return;
    }
    const allocations = Object.entries(alloc)
      .filter(([, v]) => v && parseAmountInput(v) > 0)
      .map(([invoiceId, amountGross]) => ({
        invoiceId,
        amountGross: parseAmountInput(amountGross),
      }));
    const r = await fetch("/api/remittances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId,
        bankAccountKey,
        receivedAt,
        amountGross: receiptGross,
        reference,
        allocations,
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      setErr(d.error);
      return;
    }
    setOk(`Saved remittance ${d.remittanceId}`);
    setDraft((prev) => ({
      ...prev,
      alloc: {},
      amount: "",
      reference: "",
    }));
    if (customerId) {
      fetch(`/api/invoices/open-for-allocation?customerId=${customerId}`)
        .then((r) => r.json())
        .then((data: InvRow[]) => Array.isArray(data) && setRows(data));
    }
  }

  const allocSum = Object.entries(alloc).reduce((s, [, v]) => {
    const n = parseAmountInput(v);
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);

  useEffect(() => {
    if (amountManualLock.current) return;
    const next = formatAmountForInput(allocSum);
    setDraft((d) => (d.amount === next ? d : { ...d, amount: next }));
  }, [allocSum, setDraft]);

  const searchTerms = useMemo(
    () =>
      invoiceSearch
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean),
    [invoiceSearch]
  );

  const filteredRows = useMemo(() => {
    if (searchTerms.length === 0) return rows;
    return rows.filter((row) => {
      const hay = [
        row.invoiceNumber,
        row.siteAddress,
        row.poNumber,
        row.issueDate?.slice(0, 10) ?? "",
        row.dueDate?.slice(0, 10) ?? "",
        formatInvoiceDate(row.issueDate),
        formatInvoiceDate(row.dueDate),
      ]
        .join(" ")
        .toLowerCase();
      return searchTerms.every((t) => hay.includes(t));
    });
  }, [rows, searchTerms]);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          Receive money (customer)
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          The <strong>Amount received</strong> is the cash that hit your bank for this receipt — it
          increases your bank balance <strong>once</strong> when you save.{" "}
          <strong>This receipt</strong> lines only assign that cash to invoices; they do not add
          to the bank again. (To change an existing receipt, use{" "}
          <span className="font-medium">Bank activity</span>.) Use <strong>Search invoices</strong>{" "}
          when there are many lines. <strong>Read remittance (PDF)</strong> for payment advices
          (requires <code className="rounded bg-slate-100 px-1">OPENAI_API_KEY</code>).
        </p>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <label className="grid gap-1 font-medium text-slate-800">
              Customer
              <select
                className="rounded border border-slate-300 bg-white px-2 py-2 text-slate-900"
                value={customerId}
                onChange={(e) => {
                  amountManualLock.current = false;
                  setInvoiceSearch("");
                  setDraft((d) => ({
                    ...d,
                    customerId: e.target.value,
                    alloc: {},
                  }));
                }}
                required
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
              Bank account (received into)
              <select
                className="rounded border border-slate-300 bg-white px-2 py-2 text-slate-900"
                value={bankAccountKey}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, bankAccountKey: e.target.value }))
                }
              >
                <option value="default">
                  {bank?.accountLabel
                    ? `${bank.accountLabel}${bank.bankName ? ` · ${bank.bankName}` : ""}`
                    : "Default bank account"}
                </option>
              </select>
            </label>
            <label className="grid gap-1 font-medium text-slate-800">
              Received date
              <input
                type="date"
                className="rounded border border-slate-300 bg-white px-2 py-2 text-slate-900"
                value={receivedAt}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, receivedAt: e.target.value }))
                }
                required
              />
            </label>
            <label className="grid gap-1 font-medium text-slate-800">
              Amount received (gross, £)
              <span className="text-xs font-normal text-slate-500">
                Auto-filled from allocations; edit if receipt differs
              </span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="rounded border border-slate-300 bg-white px-2 py-2 text-slate-900 tabular-nums"
                value={amount}
                onChange={(e) => {
                  amountManualLock.current = true;
                  setDraft((d) => ({ ...d, amount: e.target.value }));
                }}
                placeholder="0.00"
                required
              />
            </label>
            <label className="grid gap-1 font-medium text-slate-800">
              Reference / narrative
              <input
                className="rounded border border-slate-300 bg-white px-2 py-2 text-slate-900"
                value={reference}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, reference: e.target.value }))
                }
                placeholder="e.g. BACS ref, remittance note"
              />
            </label>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Allocations below should not exceed each row&apos;s <strong>Balance</strong>.
            Sum of allocations: <strong>{formatPounds(allocSum)}</strong> (must be ≤ receipt
            amount).
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-sm font-semibold text-slate-900">Read remittance (PDF)</h2>
          <p className="mt-1 text-xs text-slate-600">
            Upload a customer payment advice. Extraction uses AI to cope with different
            layouts; always review before saving.
          </p>
          <input
            type="file"
            accept="application/pdf"
            disabled={!customerId || parseBusy}
            className="mt-2 block text-sm text-slate-800"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void parseRemittancePdf(f);
              e.target.value = "";
            }}
          />
          {parseBusy ? (
            <p className="mt-2 text-sm text-slate-600">Reading PDF…</p>
          ) : null}
          {parseNote ? (
            <p className="mt-2 text-sm text-neutral-800">{parseNote}</p>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-100 px-3 py-2 space-y-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Allocate to outstanding invoices
              </h2>
              <p className="text-xs text-slate-600">
                All open items for this customer with a balance due. Enter{" "}
                <strong>This receipt</strong> to pay down each invoice (partial or full).
                Searching only hides rows — amounts you entered are kept.
              </p>
            </div>
            {customerId && rows.length > 0 ? (
              <label className="flex max-w-md flex-col gap-1 text-xs font-medium text-slate-800">
                Search invoices
                <input
                  type="search"
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  placeholder="Invoice no., site, PO, date…"
                  className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-900"
                  autoComplete="off"
                />
                {searchTerms.length > 0 ? (
                  <span className="font-normal text-slate-500">
                    Showing {filteredRows.length} of {rows.length} invoice
                    {rows.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </label>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
                  <th className="px-2 py-2">Invoice</th>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Site / detail</th>
                  <th className="px-2 py-2 text-right">Gross (£)</th>
                  <th className="px-2 py-2 text-right">Paid to date (£)</th>
                  <th className="px-2 py-2 text-right">Balance (£)</th>
                  <th className="px-2 py-2 text-right">This receipt (£)</th>
                  <th className="px-2 py-2 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {!customerId ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                      Select a customer to list outstanding invoices.
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                      No outstanding invoices for this customer.
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                      No invoices match your search. Clear search to see
                      all lines — your entered amounts are still saved.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr
                      key={row._id}
                      className="border-b border-slate-100 hover:bg-slate-50/80"
                    >
                      <td className="px-2 py-2 font-medium text-slate-900">
                        {row.invoiceNumber}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-slate-700">
                        {formatInvoiceDate(row.issueDate)}
                      </td>
                      <td className="max-w-[220px] px-2 py-2 text-slate-600 truncate" title={row.siteAddress}>
                        {row.siteAddress || "—"}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-800">
                        {formatPounds(row.amountGross)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                        {formatPounds(row.paidGross)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium text-slate-900">
                        {formatPounds(row.balanceGross)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="0.00"
                          className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-right text-slate-900 tabular-nums"
                          value={alloc[row._id] ?? ""}
                          onChange={(e) => setAllocFor(row._id, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          className="text-xs font-medium text-neutral-800 hover:underline"
                          onClick={() => fillMaxBalance(row._id, row.balanceGross)}
                        >
                          Pay all
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {err ? (
          <p className="text-sm text-red-600 whitespace-pre-wrap">{err}</p>
        ) : null}
        {ok ? <p className="text-sm text-neutral-800">{ok}</p> : null}

        <button
          type="submit"
          className="rounded bg-neutral-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700"
        >
          Save remittance
        </button>
      </form>
    </div>
  );
}
