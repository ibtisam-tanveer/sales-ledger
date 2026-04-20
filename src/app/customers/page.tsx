"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePersistedPageState } from "@/hooks/usePersistedPageState";
import { formatPounds } from "@/lib/format/money";

type Customer = {
  _id: string;
  name: string;
  billingAddress: string;
  externalRef?: string;
};

export default function CustomersPage() {
  const [list, setList] = useState<Customer[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const initialDraft = useMemo(
    () => ({
      name: "",
      addr: "",
      ref: "",
      search: "",
      editingId: null as string | null,
      editName: "",
      editAddr: "",
      editRef: "",
    }),
    []
  );
  const [draft, setDraft] = usePersistedPageState(initialDraft);
  const { name, addr, ref, search, editingId, editName, editAddr, editRef } = draft;
  const [err, setErr] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importReport, setImportReport] = useState<{
    created: number;
    failed: number;
    errors: { row: number; error: string }[];
  } | null>(null);

  const searchTerms = useMemo(
    () =>
      search
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean),
    [search]
  );

  const filteredList = useMemo(() => {
    if (searchTerms.length === 0) return list;
    return list.filter((c) => {
      const hay = [c.name, c.billingAddress, c.externalRef ?? ""]
        .join(" ")
        .toLowerCase();
      return searchTerms.every((t) => hay.includes(t));
    });
  }, [list, searchTerms]);

  async function load() {
    const [custR, balR] = await Promise.all([
      fetch("/api/customers", { cache: "no-store" }),
      fetch("/api/customers/balances", { cache: "no-store" }),
    ]);
    const d = await custR.json();
    if (custR.ok && Array.isArray(d)) setList(d);

    const b = await balR.json().catch(() => ({}));
    if (balR.ok && b && typeof b === "object" && "balances" in b) {
      setBalances((b as { balances: Record<string, number> }).balances ?? {});
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const r = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        billingAddress: addr,
        externalRef: ref,
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      setErr(d.error ?? "Failed");
      return;
    }
    setDraft((prev) => ({
      ...prev,
      name: "",
      addr: "",
      ref: "",
      search: "",
    }));
    if (d && typeof d === "object" && "_id" in d && typeof (d as Customer)._id === "string") {
      const created = d as Customer;
      setList((prev) => {
        if (prev.some((x) => x._id === created._id)) return prev;
        return [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
      });
    }
    await load();
  }

  async function runImport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setImportReport(null);
    setErr("");
    const fd = new FormData(e.currentTarget);
    const file = fd.get("importFile");
    if (!(file instanceof File) || !file.name) {
      setErr("Choose a CSV or Excel file.");
      return;
    }
    setImportBusy(true);
    try {
      const postFd = new FormData();
      postFd.set("file", file);
      const r = await fetch("/api/customers/import", { method: "POST", body: postFd });
      const d = await r.json();
      if (!r.ok) {
        setErr(typeof d.error === "string" ? d.error : "Import failed");
        return;
      }
      setImportReport({
        created: d.created ?? 0,
        failed: d.failed ?? 0,
        errors: Array.isArray(d.errors) ? d.errors : [],
      });
      e.currentTarget.reset();
      load();
    } finally {
      setImportBusy(false);
    }
  }

  async function saveEdit(id: string) {
    setErr("");
    const r = await fetch(`/api/customers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName.trim(),
        billingAddress: editAddr,
        externalRef: editRef,
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      setErr(d.error ?? "Failed");
      return;
    }
    setDraft((d) => ({ ...d, editingId: null }));
    load();
  }

  async function del(id: string, nameToShow: string) {
    setErr("");
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete customer "${nameToShow}"? This cannot be undone.`)
    ) {
      return;
    }
    const r = await fetch(`/api/customers/${id}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(d.error ?? "Delete failed");
      return;
    }
    setList((prev) => prev.filter((c) => c._id !== id));
    await load();
  }

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold text-slate-900">Customers</h1>
      <form
        onSubmit={runImport}
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      >
        <p className="text-sm font-medium text-slate-800">Import from CSV or Excel (.xlsx)</p>
        <p className="text-xs text-slate-600">
          Include a header row. Recognised columns: <strong>Name</strong> (required),{" "}
          <strong>Billing address</strong> / Address, <strong>External ref</strong> / Ref / Customer
          ID. Rows that fail are skipped and listed below; the rest are still created.
        </p>
        <input
          type="file"
          name="importFile"
          accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="block w-full text-sm text-slate-900"
          required
        />
        <button
          type="submit"
          disabled={importBusy}
          className="rounded bg-neutral-600 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {importBusy ? "Importing…" : "Import file"}
        </button>
        {importReport ? (
          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
            <p>
              Created <strong>{importReport.created}</strong>, failed{" "}
              <strong>{importReport.failed}</strong>.
            </p>
            {importReport.errors.length > 0 ? (
              <ul className="mt-2 max-h-40 list-inside list-disc overflow-y-auto text-xs text-red-800">
                {importReport.errors.slice(0, 50).map((ex, i) => (
                  <li key={i}>
                    Row {ex.row}: {ex.error}
                  </li>
                ))}
                {importReport.errors.length > 50 ? (
                  <li>…and {importReport.errors.length - 50} more</li>
                ) : null}
              </ul>
            ) : null}
          </div>
        ) : null}
      </form>
      <form
        onSubmit={add}
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      >
        <p className="text-sm font-medium text-slate-800">Add customer</p>
        <input
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900"
          placeholder="Name"
          value={name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          required
        />
        <textarea
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900"
          placeholder="Billing address"
          rows={3}
          value={addr}
          onChange={(e) => setDraft((d) => ({ ...d, addr: e.target.value }))}
        />
        <input
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900"
          placeholder="External ref / Customer ID (optional)"
          value={ref}
          onChange={(e) => setDraft((d) => ({ ...d, ref: e.target.value }))}
        />
        {err && !editingId ? <p className="text-sm text-red-600">{err}</p> : null}
        <button
          type="submit"
          className="rounded bg-zinc-900 px-4 py-2 text-sm text-white"
        >
          Save
        </button>
      </form>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <label className="grid gap-1 text-sm font-medium text-slate-800">
          Search customers
          <input
            type="search"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900"
            placeholder="Search any field (name, address, ref)…"
            value={search}
            onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
          />
          {searchTerms.length > 0 ? (
            <span className="text-xs font-normal text-slate-500">
              Showing {filteredList.length} of {list.length}
            </span>
          ) : null}
        </label>
      </div>

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white shadow-sm">
        {filteredList.map((c) => (
          <li
            key={c._id}
            className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between"
          >
            {editingId === c._id ? (
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <input
                  className="w-full rounded border border-slate-300 px-2 py-1.5 font-medium text-slate-900"
                  value={editName}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, editName: e.target.value }))
                  }
                  aria-label="Customer name"
                />
                <textarea
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-slate-900"
                  rows={3}
                  value={editAddr}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, editAddr: e.target.value }))
                  }
                  aria-label="Billing address"
                />
                <input
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-slate-900"
                  placeholder="External ref"
                  value={editRef}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, editRef: e.target.value }))
                  }
                  aria-label="External reference"
                />
                {err ? <p className="text-sm text-red-600">{err}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded bg-neutral-600 px-3 py-1.5 text-sm text-white hover:bg-neutral-700"
                    onClick={() => saveEdit(c._id)}
                  >
                    Save changes
                  </button>
                  <button
                    type="button"
                    className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800"
                    onClick={() => {
                      setDraft((d) => ({ ...d, editingId: null }));
                      setErr("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() =>
                    setExpanded((prev) => ({ ...prev, [c._id]: !prev[c._id] }))
                  }
                  aria-expanded={!!expanded[c._id]}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-medium text-slate-900">
                      {c.name}
                    </span>
                    {typeof balances[c._id] === "number" ? (
                      <Link
                        href={`/reports/ledger?customerId=${encodeURIComponent(c._id)}`}
                        className="shrink-0 tabular-nums font-medium text-neutral-800 hover:underline"
                        title="View customer activity (ledger)"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {formatPounds(balances[c._id] ?? 0)}
                      </Link>
                    ) : (
                      <span className="shrink-0 tabular-nums text-slate-800">—</span>
                    )}
                  </div>
                  {expanded[c._id] ? (
                    <div className="mt-1">
                      {c.billingAddress ? (
                        <p className="whitespace-pre-wrap text-slate-600">
                          {c.billingAddress}
                        </p>
                      ) : (
                        <p className="text-slate-500">No billing address saved.</p>
                      )}
                      {c.externalRef ? (
                        <p className="mt-1 text-xs text-slate-500">
                          Ref: {c.externalRef}
                        </p>
                      ) : null}
                      <Link
                        href={`/statements?customerId=${c._id}`}
                        className="mt-2 inline-block text-sm font-medium text-neutral-800 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Statement
                      </Link>
                    </div>
                  ) : null}
                </button>
                <div className="flex shrink-0 items-start gap-3 sm:pt-0.5">
                  <button
                    type="button"
                    className="text-sm font-medium text-neutral-800 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDraft((d) => ({
                        ...d,
                        editingId: c._id,
                        editName: c.name,
                        editAddr: c.billingAddress ?? "",
                        editRef: c.externalRef ?? "",
                      }));
                      setErr("");
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-sm font-medium text-red-700 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      void del(c._id, c.name);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
