"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CANCEL_PAGE_DRAFT_EVENT } from "@/lib/workspace/page-draft";
import { formatPounds, parseAmountInput } from "@/lib/format/money";

type Bank = {
  accountLabel: string;
  bankName: string;
  sortCode: string;
  accountNumber: string;
  balanceGross: number;
};

export default function BankPage() {
  const pathname = usePathname();
  const draftKey = `pageDraft:${pathname}`;
  const [s, setS] = useState<Bank | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/bank-account")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setErr(d.error);
          return;
        }
        const base: Bank = {
          accountLabel: d.accountLabel ?? "",
          bankName: d.bankName ?? "",
          sortCode: d.sortCode ?? "",
          accountNumber: d.accountNumber ?? "",
          balanceGross: Number(d.balanceGross) || 0,
        };
        try {
          const raw = sessionStorage.getItem(draftKey);
          if (raw) {
            const p = JSON.parse(raw) as Partial<Bank>;
            setS({
              ...base,
              ...p,
              balanceGross:
                typeof p.balanceGross === "number" && Number.isFinite(p.balanceGross)
                  ? p.balanceGross
                  : base.balanceGross,
            });
            return;
          }
        } catch {
          // ignore
        }
        setS(base);
      });
  }, [draftKey]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    setErr("");
    const r = await fetch("/api/bank-account", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    const d = await r.json();
    if (!r.ok) {
      setErr(d.error ?? "Failed");
      return;
    }
    setS({
      accountLabel: d.accountLabel ?? "",
      bankName: d.bankName ?? "",
      sortCode: d.sortCode ?? "",
      accountNumber: d.accountNumber ?? "",
      balanceGross: Number(d.balanceGross) || 0,
    });
  }

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
      fetch("/api/bank-account")
        .then((r) => r.json())
        .then((d) => {
          if (d.error) {
            setErr(d.error);
            return;
          }
          setS({
            accountLabel: d.accountLabel ?? "",
            bankName: d.bankName ?? "",
            sortCode: d.sortCode ?? "",
            accountNumber: d.accountNumber ?? "",
            balanceGross: Number(d.balanceGross) || 0,
          });
          setErr("");
        });
    }
    window.addEventListener(CANCEL_PAGE_DRAFT_EVENT, onCancelPageDraft);
    return () => window.removeEventListener(CANCEL_PAGE_DRAFT_EVENT, onCancelPageDraft);
  }, []);

  if (!s) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Bank account</h1>
        <p className="mt-1 text-sm text-slate-600">
          Sage-style bank record: details are optional until you have them. When you post{" "}
          <strong>Receive money (customer)</strong>, this account balance increases by the
          receipt amount (gross).
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <p className="font-medium text-slate-700">Current balance (gross received)</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
          {formatPounds(s.balanceGross)}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          To correct the opening position, adjust balance below after saving other fields.
        </p>
      </div>

      <form onSubmit={save} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm text-sm">
        {[
          ["accountLabel", "Account label (e.g. Main current)"],
          ["bankName", "Bank name"],
          ["sortCode", "Sort code"],
          ["accountNumber", "Account number"],
        ].map(([key, label]) => (
          <label key={key} className="grid gap-1 font-medium text-slate-800">
            {label}
            <span className="text-xs font-normal text-slate-500">Optional</span>
            <input
              className="rounded border border-slate-300 px-2 py-2 text-slate-900"
              value={s[key as keyof Bank] as string}
              onChange={(e) => setS({ ...s, [key]: e.target.value })}
            />
          </label>
        ))}
        <label className="grid gap-1 font-medium text-slate-800">
          Balance (gross) — manual correction
          <input
            type="text"
            inputMode="decimal"
            className="rounded border border-slate-300 px-2 py-2 text-slate-900 tabular-nums"
            value={String(s.balanceGross)}
            onChange={(e) => {
              const n = parseAmountInput(e.target.value);
              setS({
                ...s,
                balanceGross: e.target.value.trim() === "" ? 0 : Number.isFinite(n) ? n : s.balanceGross,
              });
            }}
          />
        </label>
        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        <button
          type="submit"
          className="w-fit rounded bg-zinc-900 px-4 py-2 text-sm text-white"
        >
          Save
        </button>
      </form>
    </div>
  );
}
