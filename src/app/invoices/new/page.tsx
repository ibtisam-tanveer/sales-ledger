"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPounds, parseAmountInput } from "@/lib/format/money";
import { usePersistedPageState } from "@/hooks/usePersistedPageState";

type Customer = { _id: string; name: string };

const VAT_TOLERANCE = 0.05;

function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysISODate(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function maxVatAllowed(net: number): number {
  if (!Number.isFinite(net) || net <= 0) return 0;
  return net * 0.2 + VAT_TOLERANCE;
}

export default function NewManualInvoicePage() {
  const router = useRouter();
  const siteBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const defaultDraft = useMemo(
    () => ({
      customerId: "",
      invoiceNumber: "",
      poNumber: "",
      siteAddress: "",
      issueDate: todayISODate(),
      dueDate: addDaysISODate(todayISODate(), 30),
      amountNet: "",
      amountVat: "",
    }),
    []
  );
  const [draft, setDraft] = usePersistedPageState(defaultDraft);
  const {
    customerId,
    invoiceNumber,
    poNumber,
    siteAddress,
    issueDate,
    dueDate,
    amountNet,
    amountVat,
  } = draft;
  const [siteSuggestions, setSiteSuggestions] = useState<string[]>([]);
  const [siteListOpen, setSiteListOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetch("/api/customers");
      const d = await r.json();
      if (!r.ok) {
        if (!cancelled) setLoadErr(d.error ?? "Could not load customers");
        return;
      }
      if (!cancelled) setCustomers(d);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const q = siteAddress.trim();
    if (q.length < 1) {
      setSiteSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/site-addresses?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (r.ok && Array.isArray(d)) {
        setSiteSuggestions(d);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [siteAddress]);

  const netNum = parseAmountInput(amountNet);
  const vatNum = parseAmountInput(amountVat);
  const grossNum =
    Number.isFinite(netNum) && Number.isFinite(vatNum) ? round2(netNum + vatNum) : NaN;
  const grossDisplay = Number.isFinite(grossNum) ? formatPounds(grossNum) : "—";
  const vatCap = maxVatAllowed(netNum);
  const vatCapDisplay =
    Number.isFinite(netNum) && netNum > 0 ? formatPounds(vatCap) : null;

  function onNetBlur() {
    const n = parseAmountInput(amountNet);
    if (Number.isFinite(n) && n > 0) {
      setDraft((d) => ({ ...d, amountVat: String(round2(n * 0.2)) }));
    }
  }

  function onVatBlur() {
    const n = parseAmountInput(amountNet);
    let v = parseAmountInput(amountVat);
    if (!Number.isFinite(n) || n <= 0) return;
    if (!Number.isFinite(v)) return;
    const cap = maxVatAllowed(n);
    v = Math.min(Math.max(0, v), cap);
    setDraft((d) => ({ ...d, amountVat: String(round2(v)) }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    if (!customerId) {
      setErr("Choose a customer.");
      return;
    }
    if (!invoiceNumber.trim()) {
      setErr("Enter an invoice number.");
      return;
    }
    const net = parseAmountInput(amountNet);
    const vat = parseAmountInput(amountVat);
    if (!Number.isFinite(net) || net <= 0) {
      setErr("Enter a net amount greater than zero.");
      return;
    }
    if (!Number.isFinite(vat) || vat < 0) {
      setErr("Enter a valid VAT amount (zero or more).");
      return;
    }
    const cap = maxVatAllowed(net);
    if (vat > cap) {
      setErr(`VAT cannot exceed ${formatPounds(cap)} (20% of net plus penny tolerance).`);
      return;
    }
    const gross = round2(net + vat);

    setBusy(true);
    try {
      const r = await fetch("/api/invoices/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          invoiceNumber: invoiceNumber.trim(),
          poNumber,
          siteAddress,
          issueDate,
          dueDate,
          amountNet: net,
          amountVat: round2(vat),
          amountGross: gross,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        const extra =
          d.math?.messages?.length ? ` — ${d.math.messages.join(" ")}` : "";
        setErr((d.error ?? "Could not create draft") + extra);
        return;
      }
      router.push(`/invoices/${d.invoiceId}/review`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">New invoice (manual)</h1>
      <p className="text-sm text-slate-600">
        Create a draft without a PDF — same review and commit steps as after an upload.
      </p>
      {loadErr ? (
        <p className="text-sm text-red-600">{loadErr}</p>
      ) : null}
      <form onSubmit={onSubmit} className="space-y-3 rounded-lg border bg-white p-4 shadow-sm">
        <label className="grid gap-1 text-sm font-medium text-slate-800">
          Customer
          <select
            required
            value={customerId}
            onChange={(e) =>
              setDraft((d) => ({ ...d, customerId: e.target.value }))
            }
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-slate-900"
          >
            <option value="">Select…</option>
            {customers.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-800">
          Invoice number
          <input
            required
            value={invoiceNumber}
            onChange={(e) =>
              setDraft((d) => ({ ...d, invoiceNumber: e.target.value }))
            }
            placeholder="e.g. 1682/26"
            autoComplete="off"
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-slate-900"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-800">
          PO number
          <input
            value={poNumber}
            onChange={(e) =>
              setDraft((d) => ({ ...d, poNumber: e.target.value }))
            }
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-slate-900"
          />
        </label>
        <div className="space-y-1">
          <div className="text-sm font-medium text-slate-800">
            Site address{" "}
            <span className="font-normal text-slate-500">
              — suggestions from saved sites and past invoices
            </span>
          </div>
          <input
            id="manual-invoice-site"
            aria-autocomplete="list"
            aria-expanded={siteListOpen && siteSuggestions.length > 0}
            value={siteAddress}
            onChange={(e) => {
              setDraft((d) => ({ ...d, siteAddress: e.target.value }));
              setSiteListOpen(true);
            }}
            onFocus={() => setSiteListOpen(true)}
            onBlur={() => {
              if (siteBlurTimer.current) clearTimeout(siteBlurTimer.current);
              siteBlurTimer.current = setTimeout(() => setSiteListOpen(false), 150);
            }}
            autoComplete="off"
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-slate-900"
          />
          {/* In-flow list so it cannot paint over Net / VAT / Gross (absolute overlay bug). */}
          {siteListOpen && siteSuggestions.length > 0 ? (
            <ul
              className="max-h-40 w-full overflow-auto rounded border border-slate-200 bg-white py-1 shadow-sm"
              role="listbox"
              aria-label="Site address suggestions"
            >
              {siteSuggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    role="option"
                    className="w-full px-2 py-1.5 text-left text-sm text-slate-900 hover:bg-slate-100"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setDraft((d) => ({ ...d, siteAddress: s }));
                      setSiteListOpen(false);
                    }}
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-sm font-medium text-slate-800">
            Issue date
            <input
              type="date"
              required
              value={issueDate}
              onChange={(e) => {
                const v = e.target.value;
                setDraft((d) => ({
                  ...d,
                  issueDate: v,
                  dueDate: addDaysISODate(v, 30),
                }));
              }}
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-slate-900"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-800">
            Due date
            <input
              type="date"
              required
              value={dueDate}
              onChange={(e) =>
                setDraft((d) => ({ ...d, dueDate: e.target.value }))
              }
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-slate-900"
            />
          </label>
        </div>
        <fieldset className="space-y-2 border-0 p-0">
          <legend className="sr-only">Amounts</legend>
          <div className="flex flex-col gap-4 md:flex-row md:items-stretch md:gap-4">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
              <label htmlFor="manual-net" className="text-sm font-medium text-slate-800">
                Net (£)
              </label>
              <input
                id="manual-net"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                required
                value={amountNet}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, amountNet: e.target.value }))
                }
                onBlur={onNetBlur}
                className="w-full min-w-0 rounded border border-slate-300 bg-white px-2 py-1.5 text-slate-900 tabular-nums"
                placeholder="0.00"
              />
              <span className="text-xs text-slate-500">
                Tab out to fill VAT at 20% (you can edit VAT after)
              </span>
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
              <label htmlFor="manual-vat" className="text-sm font-medium text-slate-800">
                VAT (£)
              </label>
              <input
                id="manual-vat"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                required
                value={amountVat}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, amountVat: e.target.value }))
                }
                onBlur={onVatBlur}
                className="w-full min-w-0 rounded border border-slate-300 bg-white px-2 py-1.5 text-slate-900 tabular-nums"
                placeholder="0.00"
              />
              <p className="min-h-10 text-xs text-slate-500">
                {vatCapDisplay ? `Max at 20% (+tolerance): ${vatCapDisplay}` : ""}
              </p>
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
              <span className="text-sm font-medium text-slate-800">Gross (£)</span>
              <div
                id="manual-gross"
                className="w-full min-w-0 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-900 tabular-nums"
                aria-live="polite"
              >
                {grossDisplay}
              </div>
              <span className="text-xs text-slate-500">Net + VAT (not over 20% VAT)</span>
            </div>
          </div>
        </fieldset>
        {err ? <p className="text-sm text-red-600 whitespace-pre-wrap">{err}</p> : null}
        <button
          type="submit"
          disabled={busy || !!loadErr}
          className="rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create draft & review"}
        </button>
      </form>
      <p className="text-sm text-slate-600">
        Prefer a PDF?{" "}
        <Link href="/upload" className="font-medium text-neutral-800 hover:underline">
          Invoice from PDF
        </Link>
      </p>
    </div>
  );
}
