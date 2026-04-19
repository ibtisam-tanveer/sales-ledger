"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

type CustomerOpt = { _id: string; name: string };

type ResultRow =
  | {
      fileName: string;
      status: "ok";
      invoiceId: string;
    }
  | {
      fileName: string;
      status: "needs_customer";
      pendingImportId: string;
      extractedName: string;
      extractedExternalRef: string;
      customers: CustomerOpt[];
    }
  | {
      fileName: string;
      status: "error";
      error: string;
    };

export default function UploadPage() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [results, setResults] = useState<ResultRow[]>([]);
  const [picker, setPicker] = useState<Record<string, string>>({});

  const processOne = useCallback(async (file: File): Promise<ResultRow> => {
    const fd = new FormData();
    fd.set("file", file);
    const r = await fetch("/api/invoices/upload", { method: "POST", body: fd });
    const d = await r.json();
    if (!r.ok) {
      return {
        fileName: file.name,
        status: "error",
        error: typeof d.error === "string" ? d.error : JSON.stringify(d),
      };
    }
    if (d.needsCustomerResolution && d.pendingImportId) {
      return {
        fileName: file.name,
        status: "needs_customer",
        pendingImportId: d.pendingImportId,
        extractedName: d.extractedName ?? "",
        extractedExternalRef: d.extractedExternalRef ?? "",
        customers: Array.isArray(d.customers) ? d.customers : [],
      };
    }
    if (d.invoiceId) {
      return { fileName: file.name, status: "ok", invoiceId: d.invoiceId };
    }
    return {
      fileName: file.name,
      status: "error",
      error: "Unexpected response from server",
    };
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    setResults([]);
    const input = e.currentTarget.querySelector<HTMLInputElement>('input[name="files"]');
    const files = input?.files;
    if (!files?.length) {
      setErr("Choose at least one PDF.");
      return;
    }
    setBusy(true);
    try {
      const list: ResultRow[] = [];
      for (const file of Array.from(files)) {
        list.push(await processOne(file));
      }
      setResults(list);
    } finally {
      setBusy(false);
    }
  }

  async function assignCustomer(pendingImportId: string, fileName: string) {
    const customerId = picker[pendingImportId]?.trim();
    if (!customerId) {
      setErr("Choose a customer for " + fileName);
      return;
    }
    setErr("");
    const r = await fetch(`/api/invoices/import-pending/${pendingImportId}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId }),
    });
    const d = await r.json();
    if (!r.ok) {
      setErr(typeof d.error === "string" ? d.error : "Assign failed");
      return;
    }
    if (typeof d.invoiceId !== "string") {
      setErr("Assign failed: no invoice id returned");
      return;
    }
    setResults((prev) =>
      prev.map((row) =>
        row.status === "needs_customer" && row.pendingImportId === pendingImportId
          ? { fileName: row.fileName, status: "ok" as const, invoiceId: d.invoiceId }
          : row
      )
    );
    setPicker((p) => {
      const next = { ...p };
      delete next[pendingImportId];
      return next;
    });
  }

  const summary = {
    ok: results.filter((r) => r.status === "ok").length,
    needs: results.filter((r) => r.status === "needs_customer").length,
    bad: results.filter((r) => r.status === "error").length,
  };

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Invoice from PDF</h1>
      <p className="text-sm text-slate-600">
        Sales on account — extract net, VAT and gross for UK reporting. You can upload{" "}
        <strong>multiple PDFs</strong>; each file is processed in turn. If the customer name on the
        invoice does not match a customer record (and customer ID does not match), the file is held
        until you pick the correct customer — other files keep processing.
      </p>
      <p className="text-sm text-slate-600">
        Customers are <strong>not</strong> created automatically from PDFs. Add or import customers
        first, or assign a customer when prompted.
      </p>
      <form onSubmit={onSubmit} className="space-y-3 rounded-lg border bg-white p-4 shadow-sm">
        <input
          type="file"
          name="files"
          accept="application/pdf"
          multiple
          required
          className="block w-full text-sm"
        />
        {err ? <p className="text-sm text-red-600 whitespace-pre-wrap">{err}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? "Processing…" : "Upload"}
        </button>
      </form>

      {results.length > 0 ? (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm text-sm">
          <p className="font-medium text-slate-900">Results</p>
          <p className="text-slate-600">
            Imported: {summary.ok} · Need customer: {summary.needs} · Errors: {summary.bad}
          </p>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {results.map((row, i) => (
              <li key={i} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <span className="font-medium text-slate-900">{row.fileName}</span>
                  {row.status === "ok" ? (
                    <p className="text-neutral-800">
                      Draft created —{" "}
                      <Link
                        href={`/invoices/${row.invoiceId}/review`}
                        className="font-medium text-neutral-800 hover:underline"
                      >
                        Open review
                      </Link>
                    </p>
                  ) : null}
                  {row.status === "needs_customer" ? (
                    <p className="text-amber-900">
                      PDF name on invoice: <strong>{row.extractedName || "—"}</strong>
                      {row.extractedExternalRef ? (
                        <>
                          {" "}
                          · ID: <strong>{row.extractedExternalRef}</strong>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                  {row.status === "error" ? (
                    <p className="text-red-700 whitespace-pre-wrap">{row.error}</p>
                  ) : null}
                </div>
                {row.status === "needs_customer" ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900 min-w-[200px]"
                      aria-label={`Customer for ${row.fileName}`}
                      value={picker[row.pendingImportId] ?? ""}
                      onChange={(e) =>
                        setPicker((p) => ({ ...p, [row.pendingImportId]: e.target.value }))
                      }
                    >
                      <option value="">Select customer…</option>
                      {row.customers.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="rounded bg-neutral-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                      disabled={!picker[row.pendingImportId]}
                      onClick={() => void assignCustomer(row.pendingImportId, row.fileName)}
                    >
                      Assign &amp; import
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-sm text-slate-600">
        No PDF?{" "}
        <Link href="/invoices/new" className="font-medium text-neutral-800 hover:underline">
          Enter invoice details manually
        </Link>{" "}
        and create a draft the same way.
      </p>
      <p className="text-sm text-slate-600">
        <Link href="/customers" className="font-medium text-neutral-800 hover:underline">
          Customer records
        </Link>{" "}
        — add or import before bulk upload if names on PDFs should match.
      </p>
    </div>
  );
}
