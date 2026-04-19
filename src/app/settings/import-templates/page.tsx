"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  emptyImportTemplate,
  INVOICE_IMPORT_COLUMN_KEYS,
  type InvoiceImportTemplate,
} from "@/lib/company-settings/invoice-import-template";
import { CANCEL_PAGE_DRAFT_EVENT } from "@/lib/workspace/page-draft";
import { INVOICE_IMPORT_PREFERRED_TEMPLATE_KEY } from "@/lib/ui/invoice-import-pref";

type ImportTemplatesState = {
  invoiceImportTemplates: InvoiceImportTemplate[];
};

const EXAMPLE_COLUMN_LABELS: InvoiceImportTemplate["columns"] = {
  customerName: "Customer name",
  invoiceNumber: "Invoice number",
  issueDate: "Issue date",
  dueDate: "Due date",
  poNumber: "PO",
  siteAddress: "Site",
  amountNet: "Net",
  amountVat: "VAT",
  amountGross: "Gross",
  status: "Status",
};

function baseFromApi(raw: Record<string, unknown>): ImportTemplatesState {
  return {
    invoiceImportTemplates: Array.isArray(raw.invoiceImportTemplates)
      ? (raw.invoiceImportTemplates as InvoiceImportTemplate[])
      : [],
  };
}

export default function ImportTemplatesSettingsPage() {
  const pathname = usePathname();
  const draftKey = `pageDraft:${pathname}`;
  const [s, setS] = useState<ImportTemplatesState | null>(null);
  const [err, setErr] = useState("");
  const [preferredId, setPreferredIdState] = useState("");

  const syncPreferredFromStorage = useCallback(() => {
    try {
      setPreferredIdState(
        localStorage.getItem(INVOICE_IMPORT_PREFERRED_TEMPLATE_KEY) ?? ""
      );
    } catch {
      setPreferredIdState("");
    }
  }, []);

  useEffect(() => {
    syncPreferredFromStorage();
  }, [syncPreferredFromStorage]);

  function setPreferredId(id: string) {
    setPreferredIdState(id);
    try {
      if (id) {
        localStorage.setItem(INVOICE_IMPORT_PREFERRED_TEMPLATE_KEY, id);
      } else {
        localStorage.removeItem(INVOICE_IMPORT_PREFERRED_TEMPLATE_KEY);
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetch("/api/company-settings")
      .then((r) => r.json())
      .then((d) => {
        const rawBase = d as Record<string, unknown>;
        const base = baseFromApi(rawBase);
        try {
          const raw = sessionStorage.getItem(draftKey);
          if (raw) {
            const p = JSON.parse(raw) as Partial<ImportTemplatesState>;
            setS({ ...base, ...p });
            return;
          }
        } catch {
          // ignore
        }
        setS(base);
      });
  }, [draftKey]);

  useEffect(() => {
    if (!s) return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(s));
    } catch {
      // ignore
    }
  }, [draftKey, s]);

  useEffect(() => {
    function onCancelPageDraft() {
      fetch("/api/company-settings")
        .then((r) => r.json())
        .then((d) => {
          setS(baseFromApi(d as Record<string, unknown>));
          setErr("");
        });
    }
    window.addEventListener(CANCEL_PAGE_DRAFT_EVENT, onCancelPageDraft);
    return () => window.removeEventListener(CANCEL_PAGE_DRAFT_EVENT, onCancelPageDraft);
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    const r = await fetch("/api/company-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceImportTemplates: s.invoiceImportTemplates }),
    });
    const d = await r.json();
    if (!r.ok) {
      setErr(typeof d.error === "string" ? d.error : "Save failed");
      return;
    }
    setS(baseFromApi(d as Record<string, unknown>));
    setErr("");
  }

  function addTemplate() {
    if (!s) return;
    setS({
      ...s,
      invoiceImportTemplates: [...s.invoiceImportTemplates, emptyImportTemplate()],
    });
  }

  function removeTemplate(id: string) {
    if (!s) return;
    setS({
      ...s,
      invoiceImportTemplates: s.invoiceImportTemplates.filter((t) => t.id !== id),
    });
    if (preferredId === id) setPreferredId("");
  }

  function updateTemplate(id: string, patch: Partial<InvoiceImportTemplate>) {
    if (!s) return;
    setS({
      ...s,
      invoiceImportTemplates: s.invoiceImportTemplates.map((t) =>
        t.id === id ? { ...t, ...patch } : t
      ),
    });
  }

  function setColumnLabel(
    templateId: string,
    key: keyof InvoiceImportTemplate["columns"],
    value: string
  ) {
    if (!s) return;
    const t = s.invoiceImportTemplates.find((x) => x.id === templateId);
    if (!t) return;
    updateTemplate(templateId, {
      columns: { ...t.columns, [key]: value },
    });
  }

  function fillExampleColumns(templateId: string) {
    if (!s) return;
    const t = s.invoiceImportTemplates.find((x) => x.id === templateId);
    if (!t) return;
    updateTemplate(templateId, { columns: { ...EXAMPLE_COLUMN_LABELS } });
  }

  if (!s) return <p className="text-sm text-zinc-500">Loading…</p>;

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-xl font-semibold">Import templates</h1>
      <p className="text-sm text-zinc-600">
        Download blank files to prepare data, then import customers under{" "}
        <strong>Customer records</strong> and sales invoices from the{" "}
        <strong>Sales invoice register</strong>. Map spreadsheet columns below for Excel invoice
        imports; customers must already exist (names match case-insensitively).
      </p>

      <section className="rounded-lg border bg-white p-4 shadow-sm text-sm space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">Download blank templates</h2>
        <p className="text-zinc-600">
          Use these headers when building your own file — they match the import tools.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded border border-zinc-200 bg-zinc-50/80 p-3 space-y-2">
            <span className="font-medium text-zinc-800">Customer records</span>
            <p className="text-xs text-zinc-600">
              Name, billing address, external ref — import on Customer records.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-50"
                href="/api/settings/import-templates?kind=customers&format=csv"
              >
                CSV
              </a>
              <a
                className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-50"
                href="/api/settings/import-templates?kind=customers&format=xlsx"
              >
                Excel (.xlsx)
              </a>
            </div>
          </div>
          <div className="rounded border border-zinc-200 bg-zinc-50/80 p-3 space-y-2">
            <span className="font-medium text-zinc-800">Sales invoices (ledger)</span>
            <p className="text-xs text-zinc-600">
              Column labels below — use <strong>Import from Excel</strong> on the invoice register
              after saving mappings here.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-50"
                href="/api/settings/import-templates?kind=sales-invoices&format=csv"
              >
                CSV
              </a>
              <a
                className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-50"
                href="/api/settings/import-templates?kind=sales-invoices&format=xlsx"
              >
                Excel (.xlsx)
              </a>
            </div>
          </div>
        </div>
      </section>

      <form onSubmit={save} className="grid gap-3 rounded-lg border bg-white p-4 shadow-sm text-sm">
        <div className="border-b border-zinc-200 pb-4 space-y-2">
          <h2 className="text-lg font-semibold text-zinc-900">Invoice Excel import templates</h2>
          <p className="text-zinc-600">
            Map your workbook column headers to fields. Headers must match the row you set (case-
            insensitive). The first worksheet in the workbook is used when importing.
          </p>
          {s.invoiceImportTemplates.length > 0 ? (
            <label className="grid gap-1 max-w-md font-medium text-zinc-800">
              Default template for Sales invoice register → Import from Excel
              <select
                className="rounded border border-zinc-300 px-2 py-1.5 bg-white"
                value={preferredId}
                onChange={(e) => setPreferredId(e.target.value)}
              >
                <option value="">First saved template</option>
                {s.invoiceImportTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div className="mt-1 space-y-4">
          {s.invoiceImportTemplates.map((t) => (
            <div
              key={t.id}
              className="rounded border border-zinc-200 bg-zinc-50/80 p-3 space-y-2"
            >
              <div className="flex flex-wrap items-end gap-2">
                <label className="grid gap-1 font-medium text-zinc-800">
                  Template name
                  <input
                    className="min-w-[200px] rounded border border-zinc-300 px-2 py-1.5"
                    value={t.name}
                    onChange={(e) => updateTemplate(t.id, { name: e.target.value })}
                  />
                </label>
                <label className="grid gap-1 font-medium text-zinc-800">
                  Header row (1 = first row)
                  <input
                    type="number"
                    min={1}
                    className="w-24 rounded border border-zinc-300 px-2 py-1.5 tabular-nums"
                    value={t.headerRow}
                    onChange={(e) =>
                      updateTemplate(t.id, {
                        headerRow: Math.max(1, parseInt(e.target.value, 10) || 1),
                      })
                    }
                  />
                </label>
                <label className="grid gap-1 font-medium text-zinc-800">
                  Default status (if no Status column)
                  <select
                    className="rounded border border-zinc-300 px-2 py-1.5"
                    value={t.defaultStatus}
                    onChange={(e) =>
                      updateTemplate(t.id, {
                        defaultStatus: e.target.value as InvoiceImportTemplate["defaultStatus"],
                      })
                    }
                  >
                    <option value="draft">Draft</option>
                    <option value="open">Open</option>
                    <option value="partially_paid">Part paid</option>
                    <option value="paid">Paid</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs hover:bg-zinc-50"
                  onClick={() => fillExampleColumns(t.id)}
                >
                  Fill example headers
                </button>
                <button
                  type="button"
                  className="rounded border border-red-200 bg-white px-2 py-1.5 text-xs text-red-800 hover:bg-red-50"
                  onClick={() => removeTemplate(t.id)}
                >
                  Remove
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {INVOICE_IMPORT_COLUMN_KEYS.map(({ key, label, required }) => (
                  <label key={key} className="grid gap-0.5 text-xs">
                    <span className="font-medium text-zinc-700">
                      {label}
                      {required ? <span className="text-red-600"> *</span> : null}
                    </span>
                    <input
                      className="rounded border border-zinc-300 px-2 py-1"
                      placeholder={`Excel header for ${label}`}
                      value={t.columns[key] ?? ""}
                      onChange={(e) => setColumnLabel(t.id, key, e.target.value)}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button
            type="button"
            className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50"
            onClick={addTemplate}
          >
            + Add template
          </button>
        </div>
        {err ? <p className="text-red-600">{err}</p> : null}

        <button type="submit" className="rounded bg-zinc-900 px-4 py-2 text-white w-fit">
          Save import templates
        </button>
      </form>
    </div>
  );
}
