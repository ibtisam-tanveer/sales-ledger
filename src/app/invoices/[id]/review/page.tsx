"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { addDays, format, parseISO } from "date-fns";
import { formatAmountForInput, parseAmountInput } from "@/lib/format/money";
import { validateInvoiceMath } from "@/lib/validation/invoice-math";
import { invoiceCalendarDayKeyLondon } from "@/lib/format/dates";
import { selectDateInputOnFocus } from "@/lib/ui/date-input-focus";

const VAT_RATE = 0.2;
/** Default payment terms when issue date changes (due date stays editable). */
const DUE_DAYS_AFTER_ISSUE = 30;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type Line = {
  _id?: string;
  shiftDate: string;
  description: string;
  unitPrice: number;
  totalHours: number;
};

type Invoice = {
  _id: string;
  invoiceNumber: string;
  poNumber?: string;
  issueDate: string;
  dueDate: string;
  siteAddress: string;
  amountNet: number;
  amountVat: number;
  amountGross: number;
  customerId: string;
  customerName?: string;
  status: string;
  lines: Line[];
  allocatedGross?: number;
  hasPdf?: boolean;
};

type CustomerOpt = { _id: string; name: string };

export default function ReviewInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [inv, setInv] = useState<Invoice | null>(null);
  const [err, setErr] = useState("");
  const [customers, setCustomers] = useState<CustomerOpt[]>([]);
  const [customersLoadErr, setCustomersLoadErr] = useState("");

  const [customerId, setCustomerId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [amountNet, setAmountNet] = useState(0);
  const [amountVat, setAmountVat] = useState(0);
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await fetch(`/api/invoices/${id}`);
    const d = await r.json();
    if (!r.ok) {
      setErr(d.error);
      return;
    }
    setInv(d);
  }

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetch("/api/customers");
      const d = await r.json();
      if (!r.ok) {
        if (!cancelled) setCustomersLoadErr(typeof d.error === "string" ? d.error : "Could not load customers");
        return;
      }
      if (!cancelled && Array.isArray(d)) setCustomers(d);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!inv) return;
    setCustomerId(inv.customerId ?? "");
    setInvoiceNumber(inv.invoiceNumber);
    setPoNumber(inv.poNumber ?? "");
    setSiteAddress(inv.siteAddress);
    // Use UK calendar date to avoid “off by one” from UTC ISO strings.
    setIssueDate(invoiceCalendarDayKeyLondon(inv.issueDate) || inv.issueDate.slice(0, 10));
    setDueDate(invoiceCalendarDayKeyLondon(inv.dueDate) || inv.dueDate.slice(0, 10));
    setAmountNet(Number(inv.amountNet) || 0);
    setAmountVat(Number(inv.amountVat) || 0);
  }, [inv]);

  const amountGross = round2(amountNet + amountVat);

  function dueDateFromIssueYmd(issueYmd: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(issueYmd)) return issueYmd;
    const base = parseISO(`${issueYmd}T12:00:00`);
    return format(addDays(base, DUE_DAYS_AFTER_ISSUE), "yyyy-MM-dd");
  }

  function onNetChange(raw: string) {
    const n = parseAmountInput(raw);
    if (raw.trim() === "") {
      setAmountNet(0);
      setAmountVat(0);
      return;
    }
    if (!Number.isFinite(n)) return;
    setAmountNet(n);
    setAmountVat(round2(n * VAT_RATE));
  }

  function onVatChange(raw: string) {
    const n = parseAmountInput(raw);
    if (raw.trim() === "") {
      setAmountVat(0);
      return;
    }
    if (!Number.isFinite(n)) return;
    setAmountVat(n);
  }

  async function handleSave() {
    if (!inv) return;
    setErr("");
    if (!customerId.trim()) {
      setErr("Choose a customer.");
      return;
    }
    setSaving(true);
    try {
      const isDraftNow = inv.status === "draft";
      const merged: Invoice = {
        ...inv,
        customerId,
        invoiceNumber,
        poNumber,
        siteAddress,
        issueDate,
        dueDate,
        amountNet,
        amountVat,
        amountGross,
      };
      const m = validateInvoiceMath(
        merged.lines.map((l) => ({
          unitPrice: Number(l.unitPrice),
          totalHours: Number(l.totalHours),
        })),
        Number(merged.amountNet),
        Number(merged.amountVat),
        Number(merged.amountGross)
      );
      let forceCommit = false;
      if (m.messages.length > 0) {
        const ok = window.confirm(
          `Warning — totals look inconsistent:\n\n${m.messages.join("\n\n")}\n\nSave these values anyway?`
        );
        if (!ok) return;
        forceCommit = true;
      }
      const r = await fetch(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          invoiceNumber,
          poNumber,
          siteAddress,
          issueDate,
          dueDate,
          amountNet,
          amountVat,
          amountGross,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error);
        await load();
        return;
      }
      setInv(d);

      // If reviewing a draft, saving should also post/commit so the user doesn't need
      // a separate commit step.
      if (isDraftNow) {
        const commitR = await fetch(`/api/invoices/${id}/commit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: forceCommit }),
        });
        const commitD = await commitR.json().catch(() => ({}));
        if (!commitR.ok) {
          const extra =
            Array.isArray(commitD.math?.messages) && commitD.math.messages.length
              ? ` — ${commitD.math.messages.join(" ")}`
              : "";
          setErr((commitD.error ?? "Commit failed") + extra);
          await load();
          return;
        }
        router.push("/invoices");
      }
    } finally {
      setSaving(false);
    }
  }

  async function commit(force: boolean) {
    const r = await fetch(`/api/invoices/${id}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    });
    const d = await r.json();
    if (!r.ok) {
      const extra =
        Array.isArray(d.math?.messages) && d.math.messages.length
          ? ` — ${d.math.messages.join(" ")}`
          : "";
      setErr((d.error ?? "Commit failed") + extra);
      return;
    }
    router.push("/invoices");
  }

  if (!inv && !err) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }
  if (!inv) {
    return <p className="text-red-600">{err}</p>;
  }

  const isDraft = inv.status === "draft";

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-semibold text-zinc-900">
            {isDraft ? "Review draft invoice" : "Edit invoice"}
          </h1>
          {inv.hasPdf ? (
            <a
              href={`/api/invoices/${id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              View original PDF
            </a>
          ) : null}
        </div>

        {inv.hasPdf ? (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-700">
              Uploaded invoice (original PDF)
            </div>
            <iframe
              title="Uploaded invoice PDF"
              src={`/api/invoices/${id}/pdf?mode=inline`}
              className="h-[70vh] w-full bg-white"
            />
          </div>
        ) : (
          <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            No uploaded invoice PDF found for this invoice.
          </p>
        )}
      </div>

      <div className="space-y-6">
        <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
          VAT defaults to <strong>20% of net</strong> when you change net (you can still edit VAT).
          Gross is always <strong>net + VAT</strong>. Changing <strong>issue date</strong> sets due
          date to <strong>30 days</strong> after issue (you can still edit due date). Use{" "}
          <strong>Save changes</strong> to update the invoice. If line totals do not match net, you
          will be asked to confirm before saving.
        </p>
        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        <div className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm text-sm text-zinc-900">
          <label className="grid min-w-0 gap-1 font-medium text-zinc-800">
            <span>Customer</span>
            <span className="text-xs font-normal text-zinc-500">
              Link this invoice to a customer — compare with the PDF; use Save changes to apply
            </span>
            {customersLoadErr ? (
              <span className="text-xs font-normal text-red-600">{customersLoadErr}</span>
            ) : null}
            <select
              required
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full min-w-0 max-w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900"
            >
              <option value="">Select…</option>
              {inv.customerId &&
              !customers.some((c) => c._id === inv.customerId) ? (
                <option value={inv.customerId}>
                  {inv.customerName?.trim() || "Current customer"} (linked)
                </option>
              ) : null}
              {customers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 font-medium text-zinc-800">
            Invoice number
            <input
              className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
            />
          </label>
          <label className="grid gap-1 font-medium text-zinc-800">
            PO number
            <input
              className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
            />
          </label>
          <label className="grid gap-1 font-medium text-zinc-800">
            Site
            <input
              className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900"
              value={siteAddress}
              onChange={(e) => setSiteAddress(e.target.value)}
            />
          </label>
          <label className="grid gap-1 font-medium text-zinc-800">
            Issue date
            <input
              type="date"
              className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900"
              value={issueDate}
              onFocus={selectDateInputOnFocus}
              onChange={(e) => {
                const v = e.target.value;
                setIssueDate(v);
                if (v) setDueDate(dueDateFromIssueYmd(v));
              }}
            />
          </label>
          <label className="grid gap-1">
            <span className="font-medium text-zinc-800">Due date</span>
            <span className="text-xs font-normal text-zinc-500">
              Defaults to 30 days after issue when issue date changes — editable
            </span>
            <input
              type="date"
              className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900"
              value={dueDate}
              onFocus={selectDateInputOnFocus}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-2">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-medium text-zinc-800">Net (£)</span>
              {/* Same vertical space as VAT/Gross hints so inputs share one baseline */}
              <div className="min-h-[2.5rem] text-xs leading-snug text-zinc-500 sm:min-h-[2.75rem]" />
              <input
                id="review-net"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="w-full min-w-0 rounded border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900 tabular-nums"
                value={formatAmountForInput(amountNet)}
                onChange={(e) => onNetChange(e.target.value)}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-medium text-zinc-800">VAT (£)</span>
              <p className="min-h-[2.5rem] text-xs leading-snug text-zinc-500 sm:min-h-[2.75rem]">
                20% of net when net changes — editable
              </p>
              <input
                id="review-vat"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="w-full min-w-0 rounded border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900 tabular-nums"
                value={formatAmountForInput(amountVat)}
                onChange={(e) => onVatChange(e.target.value)}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-medium text-zinc-800">Gross (£)</span>
              <p className="min-h-[2.5rem] text-xs leading-snug text-zinc-500 sm:min-h-[2.75rem]">
                Net + VAT (automatic)
              </p>
              <input
                id="review-gross"
                type="text"
                readOnly
                tabIndex={-1}
                className="w-full min-w-0 cursor-not-allowed rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-zinc-800 tabular-nums"
                value={formatAmountForInput(amountGross)}
              />
            </div>
          </div>

          <div className="pt-1">
            <button
              type="button"
              disabled={saving}
              className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              onClick={() => void handleSave()}
            >
              {saving ? "Saving…" : (isDraft ? "Save & commit" : "Save changes")}
            </button>
          </div>
        </div>
        {/* Draft invoices are committed as part of Save changes */}
      </div>
    </div>
  );
}
