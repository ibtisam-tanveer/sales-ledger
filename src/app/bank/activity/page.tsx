"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
  type ReadonlyURLSearchParams,
} from "next/navigation";
import { formatInvoiceDate, formatUiDate } from "@/lib/format/dates";
import { formatAmountForInput, formatPounds, parseAmountInput } from "@/lib/format/money";
import { selectDateInputOnFocus } from "@/lib/ui/date-input-focus";
import { TablePagination } from "@/components/TablePagination";

type Customer = { _id: string; name: string };

type RemittanceListRow = {
  _id: string;
  customerId: { _id: string; name?: string } | string;
  bankAccountKey?: string;
  receivedAt: string;
  amountGross: number;
  reference?: string;
  unappliedAmount: number;
};

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

function customerLabel(rem: RemittanceListRow): string {
  const c = rem.customerId;
  if (c && typeof c === "object" && "name" in c) {
    return String((c as { name?: string }).name ?? "");
  }
  return "";
}

function customerIdString(rem: RemittanceListRow): string {
  const c = rem.customerId;
  if (c && typeof c === "object" && "_id" in c) {
    return String((c as { _id: string })._id);
  }
  return String(c ?? "");
}

function intParam(
  sp: ReadonlyURLSearchParams,
  key: string,
  fallback: number
): number {
  const raw = sp.get(key);
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export default function BankActivityPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <BankActivityInner />
    </Suspense>
  );
}

function BankActivityInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filterCustomerId, setFilterCustomerId] = useState("");
  const [filterBankKey, setFilterBankKey] = useState("");
  const [rows, setRows] = useState<RemittanceListRow[]>([]);
  const [listErr, setListErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(() => intParam(sp, "page", 1));
  const [pageSize, setPageSize] = useState(() => intParam(sp, "pageSize", 3));
  const [invPage, setInvPage] = useState(1);
  const [invPageSize, setInvPageSize] = useState(3);
  const [didInitPaging, setDidInitPaging] = useState(false);

  useEffect(() => {
    setPage(intParam(sp, "page", 1));
    setPageSize(intParam(sp, "pageSize", 3));
  }, [sp]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCustomerName, setEditCustomerName] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [bankAccountKey, setBankAccountKey] = useState("default");
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [invRows, setInvRows] = useState<InvRow[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editErr, setEditErr] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");

  const [bank, setBank] = useState<{
    accountLabel: string;
    bankName: string;
  } | null>(null);
  const [bankAccountKeys, setBankAccountKeys] = useState<string[]>([]);

  function labelBankKey(key: string): string {
    if (key === "default" && bank) {
      const label = [bank.accountLabel, bank.bankName].filter(Boolean).join(" · ");
      return label || "Default bank account";
    }
    return key || "—";
  }

  const loadList = useCallback(async () => {
    setListErr("");
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterCustomerId) qs.set("customerId", filterCustomerId);
      if (filterBankKey) qs.set("bankAccountKey", filterBankKey);
      const q = qs.toString() ? `?${qs.toString()}` : "";
      const r = await fetch(`/api/remittances${q}`);
      const d = await r.json();
      if (!r.ok) {
        setListErr(d.error ?? "Could not load payments");
        setRows([]);
        return;
      }
      const list = Array.isArray(d.remittances)
        ? d.remittances
        : Array.isArray(d)
          ? d
          : [];
      setRows(list);
      if (Array.isArray(d.bankAccountKeys)) {
        setBankAccountKeys(d.bankAccountKeys as string[]);
      }
    } finally {
      setLoading(false);
    }
  }, [filterCustomerId, filterBankKey]);

  useEffect(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then(setCustomers);
  }, []);

  useEffect(() => {
    fetch("/api/bank-account")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) {
          setBank({
            accountLabel: d.accountLabel ?? "",
            bankName: d.bankName ?? "",
          });
        }
      });
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  function setUrlPagination(next: { page?: number; pageSize?: number }) {
    const params = new URLSearchParams(sp.toString());
    if (next.page !== undefined) params.set("page", String(next.page));
    if (next.pageSize !== undefined) params.set("pageSize", String(next.pageSize));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    if (!didInitPaging) {
      setDidInitPaging(true);
      return;
    }
    setUrlPagination({ page: 1 });
  }, [filterCustomerId, filterBankKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchTerms = useMemo(
    () =>
      invoiceSearch
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean),
    [invoiceSearch]
  );

  const filteredInvRows = useMemo(() => {
    if (searchTerms.length === 0) return invRows;
    return invRows.filter((row) => {
      const hay = [
        row.invoiceNumber,
        row.siteAddress,
        row.poNumber,
        row.issueDate?.slice(0, 10) ?? "",
        row.dueDate?.slice(0, 10) ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return searchTerms.every((t) => hay.includes(t));
    });
  }, [invRows, searchTerms]);

  useEffect(() => {
    setInvPage(1);
  }, [invoiceSearch, editingId]);

  const totalReceiptPages = Math.max(1, Math.ceil(rows.length / Math.max(1, pageSize)));
  const safeReceiptPage = Math.min(Math.max(1, page), totalReceiptPages);
  const pagedReceipts = useMemo(() => {
    const start = (safeReceiptPage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, safeReceiptPage, pageSize]);

  const totalInvPages = Math.max(
    1,
    Math.ceil(filteredInvRows.length / Math.max(1, invPageSize))
  );
  const safeInvPage = Math.min(Math.max(1, invPage), totalInvPages);
  const pagedInvRows = useMemo(() => {
    const start = (safeInvPage - 1) * invPageSize;
    return filteredInvRows.slice(start, start + invPageSize);
  }, [filteredInvRows, safeInvPage, invPageSize]);

  const allocSum = useMemo(() => {
    return Object.entries(alloc).reduce((s, [, v]) => {
      const n = parseAmountInput(v);
      return s + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [alloc]);

  function setAllocFor(invoiceId: string, value: string) {
    setAlloc((prev) => ({ ...prev, [invoiceId]: value }));
  }

  async function openEdit(id: string) {
    setEditingId(id);
    setEditErr("");
    setInvoiceSearch("");
    setEditLoading(true);
    try {
      const detailR = await fetch(`/api/remittances/${id}`);
      const detail = await detailR.json();
      if (!detailR.ok) {
        setEditErr(detail.error ?? "Could not load payment");
        setEditingId(null);
        return;
      }
      const rem = detail.remittance as RemittanceListRow & {
        receivedAt: string;
        amountGross: number;
        reference?: string;
      };
      const cid = customerIdString(rem);
      setEditCustomerName(customerLabel(rem));
      setReceivedAt(rem.receivedAt.slice(0, 10));
      setAmount(formatAmountForInput(rem.amountGross));
      setReference(rem.reference ?? "");
      setBankAccountKey(rem.bankAccountKey || "default");
      const nextAlloc: Record<string, string> = {};
      for (const a of detail.allocations as {
        invoiceId: string;
        amountGross: number;
      }[]) {
        nextAlloc[a.invoiceId] = formatAmountForInput(a.amountGross);
      }
      setAlloc(nextAlloc);

      const invUrl = `/api/invoices/open-for-allocation?customerId=${encodeURIComponent(cid)}&adjustForRemittanceId=${encodeURIComponent(id)}`;
      const invRes = await fetch(invUrl);
      const invData = await invRes.json();
      if (!invRes.ok) {
        setEditErr(invData.error ?? "Could not load invoices");
        return;
      }
      const mapped: InvRow[] = (Array.isArray(invData) ? invData : []).map(
        (r: {
          _id: string;
          invoiceNumber: string;
          issueDate: string;
          dueDate: string;
          siteAddress?: string;
          poNumber?: string;
          amountGross: number;
          paidGross: number;
          balanceGross: number;
          status: string;
        }) => ({
          _id: r._id,
          invoiceNumber: r.invoiceNumber,
          issueDate: r.issueDate,
          dueDate: r.dueDate,
          siteAddress: r.siteAddress ?? "",
          poNumber: r.poNumber ?? "",
          amountGross: r.amountGross,
          paidGross: r.paidGross,
          balanceGross: r.balanceGross,
          status: r.status,
        })
      );
      setInvRows(mapped);
    } finally {
      setEditLoading(false);
    }
  }

  function closeEdit() {
    setEditingId(null);
    setEditErr("");
    setInvRows([]);
    setAlloc({});
    setInvoiceSearch("");
    setInvPage(1);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setEditErr("");
    const receiptGross = parseAmountInput(amount);
    if (!Number.isFinite(receiptGross) || receiptGross <= 0) {
      setEditErr("Enter a valid receipt amount greater than zero.");
      return;
    }
    const allocations = Object.entries(alloc)
      .filter(([, v]) => v && parseAmountInput(v) > 0)
      .map(([invoiceId, amountGross]) => ({
        invoiceId,
        amountGross: parseAmountInput(amountGross),
      }));
    const r = await fetch(`/api/remittances/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receivedAt,
        amountGross: receiptGross,
        reference,
        bankAccountKey,
        allocations,
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      setEditErr(d.error ?? "Save failed");
      return;
    }
    closeEdit();
    void loadList();
  }

  async function removePayment(id: string) {
    const ok = window.confirm(
      "Remove this receipt and unallocate all invoices linked to it? Invoice balances will reopen so you can record a new receipt or different allocations."
    );
    if (!ok) return;
    setListErr("");
    const r = await fetch(`/api/remittances/${id}`, { method: "DELETE" });
    const d = await r.json();
    if (!r.ok) {
      setListErr(d.error ?? "Could not delete");
      return;
    }
    if (editingId === id) closeEdit();
    void loadList();
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Bank activity</h1>
        <p className="mt-1 text-sm text-slate-600">
          Customer receipts posted to the bank. <strong>Edit</strong> updates the receipt
          total and how it is split across invoices — <strong>customer activity (ledger)</strong>{" "}
          uses the new receipt amount, and <strong>Receive money</strong> uses updated
          outstanding balances. Your <strong>bank balance</strong> only moves when the receipt
          total changes (by the difference); allocating lines to invoices does not add cash again.
          <strong> Delete</strong> removes the receipt and unallocates related invoices so you can
          post a new payment on <span className="font-medium">Receive money (customer)</span>.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
        <label className="grid gap-1 font-medium text-slate-800">
          Filter by customer
          <select
            className="min-w-[200px] rounded border border-slate-300 bg-white px-2 py-2 text-slate-900"
            value={filterCustomerId}
            onChange={(e) => setFilterCustomerId(e.target.value)}
          >
            <option value="">All customers</option>
            {customers.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 font-medium text-slate-800">
          Filter by bank
          <select
            className="min-w-[220px] rounded border border-slate-300 bg-white px-2 py-2 text-slate-900"
            value={filterBankKey}
            onChange={(e) => setFilterBankKey(e.target.value)}
          >
            <option value="">All banks</option>
            {bankAccountKeys.map((k) => (
              <option key={k} value={k}>
                {labelBankKey(k)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {listErr ? (
        <p className="text-sm text-red-600">{listErr}</p>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
          Receipts (newest first)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-white text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
                <th className="px-3 py-2 whitespace-nowrap">Received</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Reference</th>
                <th className="px-3 py-2 text-right">Amount (£)</th>
                <th className="px-3 py-2 text-right">Unapplied (£)</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    No receipts recorded yet. Use Receive money (customer) to post a
                    payment.
                  </td>
                </tr>
              ) : (
                pagedReceipts.map((row) => (
                  <tr
                    key={row._id}
                    className="border-b border-slate-100 hover:bg-slate-50/80"
                    onDoubleClick={() => void openEdit(row._id)}
                    title="Double-click to open allocation details"
                  >
                    <td className="px-3 py-2 whitespace-nowrap text-slate-800">
                      {formatUiDate(row.receivedAt)}
                    </td>
                    <td className="px-3 py-2 text-slate-900">{customerLabel(row) || "—"}</td>
                    <td className="px-3 py-2 max-w-[220px] truncate text-slate-700" title={row.reference}>
                      {row.reference || "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                      {formatPounds(row.amountGross)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                      {formatPounds(row.unappliedAmount ?? 0)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button
                        type="button"
                        className="mr-3 text-xs font-medium text-neutral-800 hover:underline"
                        onClick={() => void openEdit(row._id)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-xs font-medium text-red-700 hover:underline"
                        onClick={() => void removePayment(row._id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <TablePagination
        total={rows.length}
        page={safeReceiptPage}
        pageSize={pageSize}
        itemLabel="receipts"
        onPage={(p) => setUrlPagination({ page: p })}
        onPageSize={(s) => setUrlPagination({ page: 1, pageSize: s })}
      />

      {editingId ? (
        <div className="rounded-lg border border-neutral-400/80 bg-neutral-50 p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Edit receipt</h2>
            <button
              type="button"
              className="text-sm text-slate-600 hover:text-slate-900"
              onClick={closeEdit}
            >
              Close
            </button>
          </div>
          {editLoading ? (
            <p className="text-sm text-slate-600">Loading…</p>
          ) : (
            <form onSubmit={(e) => void saveEdit(e)} className="space-y-4">
              <p className="text-sm text-slate-700">
                Customer:{" "}
                <span className="font-medium text-slate-900">{editCustomerName}</span>
              </p>
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <label className="grid gap-1 font-medium text-slate-800">
                  Bank account (received into)
                  <select
                    className="rounded border border-slate-300 bg-white px-2 py-2 text-slate-900"
                    value={bankAccountKey}
                    onChange={(e) => setBankAccountKey(e.target.value)}
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
                    required
                    className="rounded border border-slate-300 bg-white px-2 py-2 text-slate-900"
                    value={receivedAt}
                    onFocus={selectDateInputOnFocus}
                    onChange={(e) => setReceivedAt(e.target.value)}
                  />
                </label>
                <label className="grid gap-1 font-medium text-slate-800">
                  Amount received (gross, £)
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    required
                    className="rounded border border-slate-300 bg-white px-2 py-2 text-slate-900 tabular-nums"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <label className="grid gap-1 font-medium text-slate-800">
                  Reference / narrative
                  <input
                    className="rounded border border-slate-300 bg-white px-2 py-2 text-slate-900"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </label>
              </div>
              <p className="text-xs text-slate-500">
                Sum of allocations: <strong>{formatPounds(allocSum)}</strong> (must be ≤
                receipt amount). Each row&apos;s <strong>Balance</strong> is the maximum
                you can allocate on this receipt after removing the old allocation. Saving
                updates invoice balances and adjusts the bank by the change in receipt total only
                — not once per allocation line.
              </p>

              {invRows.length > 0 ? (
                <label className="flex max-w-md flex-col gap-1 text-xs font-medium text-slate-800">
                  Search invoices
                  <input
                    type="search"
                    value={invoiceSearch}
                    onChange={(e) => setInvoiceSearch(e.target.value)}
                    placeholder="Invoice no., site, PO…"
                    className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-900"
                    autoComplete="off"
                  />
                </label>
              ) : null}

              <div className="overflow-x-auto rounded border border-slate-200 bg-white">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
                      <th className="px-2 py-2">Invoice</th>
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Site / detail</th>
                      <th className="px-2 py-2 text-right">Gross (£)</th>
                      <th className="px-2 py-2 text-right">Paid to date (£)</th>
                      <th className="px-2 py-2 text-right">Balance (£)</th>
                      <th className="px-2 py-2 text-right">This receipt (£)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                          No invoices available for allocation.
                        </td>
                      </tr>
                    ) : filteredInvRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                          No invoices match search.
                        </td>
                      </tr>
                    ) : (
                      pagedInvRows.map((row) => (
                        <tr key={row._id} className="border-b border-slate-100">
                          <td className="px-2 py-2 font-medium text-slate-900">
                            {row.invoiceNumber}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap text-slate-700">
                            {formatInvoiceDate(row.issueDate)}
                          </td>
                          <td className="max-w-[200px] px-2 py-2 truncate text-slate-600" title={row.siteAddress}>
                            {row.siteAddress || "—"}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
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
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <TablePagination
                total={filteredInvRows.length}
                page={safeInvPage}
                pageSize={invPageSize}
                itemLabel="invoices"
                onPage={setInvPage}
                onPageSize={(s) => {
                  setInvPage(1);
                  setInvPageSize(s);
                }}
                className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm"
              />

              {editErr ? (
                <p className="text-sm text-red-600 whitespace-pre-wrap">{editErr}</p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Save changes
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                  onClick={closeEdit}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
