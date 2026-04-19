"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { InvoiceImportTemplate } from "@/lib/company-settings/invoice-import-template";
import { INVOICE_IMPORT_PREFERRED_TEMPLATE_KEY } from "@/lib/ui/invoice-import-pref";
import { formatInvoiceDate } from "@/lib/format/dates";
import { formatPounds } from "@/lib/format/money";

type Inv = {
  _id: string;
  customerId: string;
  customerName: string;
  invoiceNumber: string;
  issueDate: string;
  status: string;
  amountGross: number;
  siteAddress?: string;
  hasPdf?: boolean;
};

type CustomerRow = { _id: string; name: string };

const statusStyle: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-900 border-neutral-300",
  open: "bg-neutral-100 text-neutral-900 border-neutral-200",
  partially_paid: "bg-neutral-200 text-neutral-900 border-neutral-400",
  paid: "bg-neutral-300 text-neutral-900 border-neutral-500",
};

function reloadInvoices(setRows: (rows: Inv[]) => void) {
  fetch("/api/invoices")
    .then((r) => r.json())
    .then((invoices) => {
      setRows(Array.isArray(invoices) ? invoices : []);
    });
}

export default function InvoiceRegisterPage() {
  const [rows, setRows] = useState<Inv[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [transferErr, setTransferErr] = useState("");
  const [deleteErr, setDeleteErr] = useState("");
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [importTemplates, setImportTemplates] = useState<InvoiceImportTemplate[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [importErr, setImportErr] = useState("");
  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/invoices").then((r) => r.json()),
      fetch("/api/customers").then((r) => r.json()),
      fetch("/api/company-settings").then((r) => r.json()),
    ]).then(([invoices, custs, settings]) => {
      setRows(Array.isArray(invoices) ? invoices : []);
      setCustomers(Array.isArray(custs) ? custs : []);
      const t = (settings as { invoiceImportTemplates?: InvoiceImportTemplate[] })
        .invoiceImportTemplates;
      setImportTemplates(Array.isArray(t) ? t : []);
    });
  }, []);

  function resolveImportTemplateId(
    templates: InvoiceImportTemplate[]
  ): string | null {
    if (templates.length === 0) return null;
    try {
      const id = localStorage.getItem(INVOICE_IMPORT_PREFERRED_TEMPLATE_KEY);
      if (id && templates.some((t) => t.id === id)) return id;
    } catch {
      // ignore
    }
    return templates[0]?.id ?? null;
  }

  async function runExcelImport(file: File | null) {
    if (!file) return;
    setImportErr("");
    setImportMsg("");
    const importTemplateId = resolveImportTemplateId(importTemplates);
    if (!importTemplateId) {
      setImportErr(
        "Add an invoice import template under Settings → Import templates (blank downloads and column mapping are there)."
      );
      return;
    }
    setImportBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("templateId", importTemplateId);
      const r = await fetch("/api/invoices/import-excel", {
        method: "POST",
        body: fd,
      });
      const d = await r.json();
      if (!r.ok) {
        setImportErr(typeof d.error === "string" ? d.error : "Import failed");
        return;
      }
      const created = Number(d.created) || 0;
      const errs = Array.isArray(d.errors) ? (d.errors as string[]) : [];
      setImportMsg(
        `Imported ${created} invoice(s).` +
          (errs.length > 0 ? ` ${errs.length} row issue(s) — see below.` : "")
      );
      if (errs.length > 0) {
        setImportErr(errs.slice(0, 30).join("\n") + (errs.length > 30 ? "\n…" : ""));
      }
      reloadInvoices(setRows);
    } finally {
      setImportBusy(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  }

  async function transferInvoice(
    inv: Inv,
    newCustomerId: string
  ) {
    if (!newCustomerId || newCustomerId === inv.customerId) return;
    setTransferErr("");
    setDeleteErr("");
    const ok = window.confirm(
      `Move invoice ${inv.invoiceNumber} to another customer ledger?\n\n` +
        `The invoice (and its payment allocations) will be reported under the new customer.`
    );
    if (!ok) return;
    const r = await fetch(`/api/invoices/${inv._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: newCustomerId }),
    });
    const d = await r.json();
    if (!r.ok) {
      setTransferErr(typeof d.error === "string" ? d.error : "Could not update customer");
      return;
    }
    void d;
    setRows((prev) =>
      prev.map((row) =>
        row._id === inv._id
          ? {
              ...row,
              customerId: newCustomerId,
              customerName:
                customers.find((c) => c._id === newCustomerId)?.name ?? row.customerName,
            }
          : row
      )
    );
  }

  async function deleteDraftInvoice(inv: Inv) {
    setDeleteErr("");
    setTransferErr("");
    const isDraft = inv.status === "draft";
    const ok = window.confirm(
      isDraft
        ? `Delete draft invoice ${inv.invoiceNumber}?\n\nThis cannot be undone.`
        : `Delete posted invoice ${inv.invoiceNumber}?\n\n` +
            `This will REMOVE any payment allocations on this invoice and return that cash to the receipt as unapplied.\n` +
            `This cannot be undone.`
    );
    if (!ok) return;
    setDeleteBusyId(inv._id);
    try {
      const r = await fetch(`/api/invoices/${inv._id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isDraft ? {} : { force: true }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setDeleteErr(typeof d.error === "string" ? d.error : "Could not delete invoice");
        return;
      }
      setRows((prev) => prev.filter((x) => x._id !== inv._id));
    } finally {
      setDeleteBusyId(null);
    }
  }

  const filtered =
    filter === "all"
      ? rows
      : rows.filter((r) => r.status === filter);

  const searchTerms = useMemo(
    () =>
      search
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean),
    [search]
  );

  const filtered2 = useMemo(() => {
    if (searchTerms.length === 0) return filtered;
    return filtered.filter((r) => {
      const hay = [
        r.invoiceNumber,
        r.customerName ?? "",
        r.siteAddress ?? "",
        r.status,
        r.issueDate?.slice(0, 10) ?? "",
        formatInvoiceDate(r.issueDate),
        String(r.amountGross ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      return searchTerms.every((t) => hay.includes(t));
    });
  }, [filtered, searchTerms]);

  const selectedIdsInView = useMemo(() => {
    const set = new Set(filtered2.map((r) => r._id));
    return Object.keys(selected).filter((id) => selected[id] && set.has(id));
  }, [filtered2, selected]);

  const allSelectedInView = filtered2.length > 0 && selectedIdsInView.length === filtered2.length;

  async function deleteMany(ids: string[]) {
    if (ids.length === 0) return;
    setDeleteErr("");
    setTransferErr("");
    setBulkBusy(true);
    try {
      const errs: string[] = [];
      for (const id of ids) {
        const inv = rows.find((r) => r._id === id);
        if (!inv) continue;
        setDeleteBusyId(id);
        const isDraft = inv.status === "draft";
        const r = await fetch(`/api/invoices/${id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isDraft ? {} : { force: true }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          const msg = typeof d.error === "string" ? d.error : "Could not delete invoice";
          errs.push(`${inv.invoiceNumber}: ${msg}`);
        } else {
          setRows((prev) => prev.filter((x) => x._id !== id));
          setSelected((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }
      }
      if (errs.length > 0) setDeleteErr(errs.slice(0, 8).join("\n") + (errs.length > 8 ? "\n…" : ""));
    } finally {
      setDeleteBusyId(null);
      setBulkBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Invoice register</h1>
          <p className="text-sm text-slate-600">
            Drafts and posted sales invoices — open a draft to review before posting.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <Link
            href="/upload"
            className="inline-flex w-fit items-center rounded bg-neutral-600 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            + Receive invoice (PDF)
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input
              ref={importFileRef}
              type="file"
              accept=".xlsx,.xlsm"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                void runExcelImport(f);
              }}
            />
            <button
              type="button"
              disabled={importBusy}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
              onClick={() => importFileRef.current?.click()}
            >
              {importBusy ? "Importing…" : "Import from Excel"}
            </button>
          </div>
          {importMsg ? (
            <p className="text-xs text-slate-700 max-w-md text-right">{importMsg}</p>
          ) : null}
          {importErr ? (
            <pre className="max-h-32 max-w-md overflow-auto whitespace-pre-wrap text-left text-xs text-red-700">
              {importErr}
            </pre>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {(
          [
            ["all", "All"],
            ["draft", "Draft"],
            ["open", "Open"],
            ["partially_paid", "Part paid"],
            ["paid", "Paid"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setFilter(v)}
            className={`rounded border px-3 py-1 ${
              filter === v
                ? "border-neutral-600 bg-neutral-600 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="rounded border border-slate-200 bg-white p-3 text-sm shadow-sm">
        <label className="grid gap-1 font-medium text-slate-800">
          Search invoices
          <input
            type="search"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900"
            placeholder="Invoice no., customer, site, status, date, amount…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {searchTerms.length > 0 ? (
            <span className="text-xs font-normal text-slate-500">
              Showing {filtered2.length} of {filtered.length} in this filter
            </span>
          ) : null}
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="text-slate-600">
          {selectedIdsInView.length > 0 ? (
            <span>
              Selected <strong>{selectedIdsInView.length}</strong> in current view
            </span>
          ) : (
            <span>Select invoices to delete in bulk</span>
          )}
        </div>
        <button
          type="button"
          disabled={selectedIdsInView.length === 0 || bulkBusy}
          onClick={() => {
            const ok = window.confirm(
              `Delete ${selectedIdsInView.length} invoice(s)?\n\n` +
                `Posted invoices will have their payment allocations removed and returned to receipts as unapplied.`
            );
            if (!ok) return;
            void deleteMany(selectedIdsInView);
          }}
          className="rounded bg-red-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {bulkBusy ? "Deleting…" : "Delete selected"}
        </button>
      </div>
      {transferErr ? (
        <p className="text-sm text-red-600" role="alert">
          {transferErr}
        </p>
      ) : null}
      {deleteErr ? (
        <p className="whitespace-pre-wrap text-sm text-red-600" role="alert">
          {deleteErr}
        </p>
      ) : null}
      <div className="overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100 text-left text-slate-700">
              <th className="px-3 py-2 font-semibold">
                <input
                  type="checkbox"
                  aria-label="Select all invoices in view"
                  checked={allSelectedInView}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setSelected((prev) => {
                      const next = { ...prev };
                      for (const r of filtered2) next[r._id] = on;
                      return next;
                    });
                  }}
                />
              </th>
              <th className="px-3 py-2 font-semibold">Date</th>
              <th className="px-3 py-2 font-semibold">Invoice no.</th>
              <th className="px-3 py-2 font-semibold">Customer (ledger)</th>
              <th className="px-3 py-2 font-semibold">Site</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 text-right font-semibold">Gross (£)</th>
              <th className="px-3 py-2 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered2.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  {filtered.length === 0
                    ? "No invoices match this filter."
                    : "No invoices match your search."}
                </td>
              </tr>
            ) : (
              filtered2.map((r) => (
                <tr key={r._id} className="border-b border-slate-100 hover:bg-slate-50/80">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select invoice ${r.invoiceNumber}`}
                      checked={!!selected[r._id]}
                      onChange={(e) =>
                        setSelected((prev) => ({ ...prev, [r._id]: e.target.checked }))
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-slate-800">
                    {formatInvoiceDate(r.issueDate)}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">{r.invoiceNumber}</td>
                  <td className="max-w-[220px] px-3 py-2 text-slate-800">
                    <div className="flex flex-col gap-1.5">
                      <span className="font-medium leading-snug">{r.customerName || "—"}</span>
                      <label className="grid gap-0.5 text-[11px] font-normal text-slate-500">
                        <span className="sr-only">Move invoice to customer ledger</span>
                        {customers.length === 0 ? (
                          <span className="text-amber-800">
                            Add customers under{" "}
                            <Link href="/customers" className="font-medium underline">
                              Customer records
                            </Link>
                            .
                          </span>
                        ) : (
                          <select
                            className="max-w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-900"
                            value={r.customerId}
                            onChange={(e) => void transferInvoice(r, e.target.value)}
                          >
                            {!customers.some((c) => c._id === r.customerId) && r.customerId ? (
                              <option value={r.customerId}>{r.customerName} (current)</option>
                            ) : null}
                            {customers.map((c) => (
                              <option key={c._id} value={c._id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </label>
                    </div>
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-slate-600">
                    {r.siteAddress || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded border px-2 py-0.5 text-xs font-medium capitalize ${
                        statusStyle[r.status] ?? "bg-slate-100 text-slate-800"
                      }`}
                    >
                      {r.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                    {formatPounds(Number(r.amountGross))}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Link
                        href={`/invoices/${r._id}/review`}
                        className="font-medium text-neutral-800 hover:underline"
                      >
                        {r.status === "draft" ? "Review" : "Edit"}
                      </Link>
                      {r.hasPdf ? (
                        <a
                          href={`/api/invoices/${r._id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-neutral-800 hover:underline"
                        >
                          View PDF
                        </a>
                      ) : (
                        <span className="text-slate-400">No PDF</span>
                      )}
                      {r.status === "draft" ? (
                        <button
                          type="button"
                          onClick={() => void deleteDraftInvoice(r)}
                          disabled={deleteBusyId === r._id}
                          className="font-medium text-red-700 hover:underline disabled:opacity-50"
                        >
                          {deleteBusyId === r._id ? "Deleting…" : "Delete"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void deleteDraftInvoice(r)}
                          disabled={deleteBusyId === r._id}
                          className="font-medium text-red-700 hover:underline disabled:opacity-50"
                        >
                          {deleteBusyId === r._id ? "Deleting…" : "Delete"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
