"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CANCEL_PAGE_DRAFT_EVENT } from "@/lib/workspace/page-draft";

type CompanyFormSettings = {
  legalName: string;
  registeredAddress: string;
  companyRegistrationNumber: string;
  vatNumber: string;
  phone: string;
  email: string;
  logoPath: string;
};

function companyFormFromApi(raw: Record<string, unknown>): CompanyFormSettings {
  return {
    legalName: String(raw.legalName ?? ""),
    registeredAddress: String(raw.registeredAddress ?? ""),
    companyRegistrationNumber: String(raw.companyRegistrationNumber ?? ""),
    vatNumber: String(raw.vatNumber ?? ""),
    phone: String(raw.phone ?? ""),
    email: String(raw.email ?? ""),
    logoPath: String(raw.logoPath ?? ""),
  };
}

export default function CompanySettingsPage() {
  const pathname = usePathname();
  const draftKey = `pageDraft:${pathname}`;
  const [s, setS] = useState<CompanyFormSettings | null>(null);
  const [err, setErr] = useState("");
  const [logoErr, setLogoErr] = useState("");
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoPreviewKey, setLogoPreviewKey] = useState(0);

  const bumpLogoPreview = useCallback(() => {
    setLogoPreviewKey((k) => k + 1);
  }, []);

  useEffect(() => {
    fetch("/api/company-settings")
      .then((r) => r.json())
      .then((d) => {
        const rawBase = d as Record<string, unknown>;
        const base = companyFormFromApi(rawBase);
        try {
          const raw = sessionStorage.getItem(draftKey);
          if (raw) {
            const p = JSON.parse(raw) as Partial<CompanyFormSettings>;
            setS({ ...base, ...p });
            return;
          }
        } catch {
          // ignore
        }
        setS(base);
        setLogoPreviewKey((k) => k + 1);
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
          setS(companyFormFromApi(d as Record<string, unknown>));
          setErr("");
          setLogoErr("");
          setLogoPreviewKey((k) => k + 1);
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
      body: JSON.stringify({
        legalName: s.legalName,
        registeredAddress: s.registeredAddress,
        companyRegistrationNumber: s.companyRegistrationNumber,
        vatNumber: s.vatNumber,
        phone: s.phone,
        email: s.email,
        logoPath: s.logoPath,
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      setErr(d.error);
      return;
    }
    setS(companyFormFromApi(d as Record<string, unknown>));
    setErr("");
  }

  async function uploadLogo(file: File | null) {
    if (!file || !s) return;
    setLogoErr("");
    setLogoBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const r = await fetch("/api/company-settings/logo", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) {
        setLogoErr(typeof d.error === "string" ? d.error : "Upload failed");
        return;
      }
      setS((prev) =>
        prev
          ? {
              ...prev,
              ...companyFormFromApi(d as Record<string, unknown>),
            }
          : null
      );
      try {
        const merged = companyFormFromApi(d as Record<string, unknown>);
        sessionStorage.setItem(draftKey, JSON.stringify(merged));
      } catch {
        // ignore
      }
      bumpLogoPreview();
    } finally {
      setLogoBusy(false);
    }
  }

  async function clearCustomLogo() {
    if (!s) return;
    setLogoErr("");
    setLogoBusy(true);
    try {
      const r = await fetch("/api/company-settings/logo", { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) {
        setLogoErr(typeof d.error === "string" ? d.error : "Could not reset logo");
        return;
      }
      setS((prev) =>
        prev
          ? {
              ...prev,
              ...companyFormFromApi(d as Record<string, unknown>),
            }
          : null
      );
      try {
        const merged = companyFormFromApi(d as Record<string, unknown>);
        sessionStorage.setItem(draftKey, JSON.stringify(merged));
      } catch {
        // ignore
      }
      bumpLogoPreview();
    } finally {
      setLogoBusy(false);
    }
  }

  if (!s) return <p className="text-sm text-zinc-500">Loading…</p>;

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-xl font-semibold">Company details</h1>
      <p className="text-sm text-zinc-600">
        Used on statement PDF and Excel. Upload your logo (PNG, JPEG, GIF, or WebP, up to 2&nbsp;MB).
        If you do not upload a file, the bundled logo in{" "}
        <code className="rounded bg-zinc-100 px-1">public/company/facility-logo.png</code> is used.
      </p>
      <form onSubmit={save} className="grid gap-3 rounded-lg border bg-white p-4 shadow-sm text-sm">
        {[
          ["legalName", "Legal name"],
          ["registeredAddress", "Registered address (use new lines)"],
          ["companyRegistrationNumber", "Company registration no."],
          ["vatNumber", "VAT number"],
          ["phone", "Phone"],
          ["email", "Email"],
        ].map(([key, label]) => (
          <label key={key} className="grid gap-1">
            {label}
            {key === "registeredAddress" ? (
              <textarea
                className="rounded border px-2 py-2"
                rows={4}
                value={s.registeredAddress}
                onChange={(e) =>
                  setS({ ...s, registeredAddress: e.target.value })
                }
              />
            ) : (
              <input
                className="rounded border px-2 py-2"
                value={
                  key === "legalName"
                    ? s.legalName
                    : key === "companyRegistrationNumber"
                      ? s.companyRegistrationNumber
                      : key === "vatNumber"
                        ? s.vatNumber
                        : key === "phone"
                          ? s.phone
                          : s.email
                }
                onChange={(e) =>
                  setS({
                    ...s,
                    [key]: e.target.value,
                  } as CompanyFormSettings)
                }
              />
            )}
          </label>
        ))}
        <div className="grid gap-2">
          <span className="font-medium text-zinc-800">Company logo</span>
          <div className="flex flex-wrap items-start gap-4">
            <img
              src={`/api/company-settings/logo?k=${logoPreviewKey}`}
              alt="Logo preview"
              className="h-16 w-auto max-w-[200px] border border-zinc-200 bg-zinc-50 object-contain p-1"
            />
            <div className="grid gap-2">
              <label className="grid gap-1">
                <span className="sr-only">Upload logo image</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                  disabled={logoBusy}
                  className="max-w-xs text-xs file:mr-2 file:rounded file:border file:border-zinc-300 file:bg-zinc-50 file:px-2 file:py-1"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    void uploadLogo(f);
                  }}
                />
              </label>
              {s.logoPath?.trim() ? (
                <button
                  type="button"
                  disabled={logoBusy}
                  onClick={() => void clearCustomLogo()}
                  className="w-fit rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Use default logo
                </button>
              ) : null}
            </div>
          </div>
          {logoErr ? <p className="text-red-600">{logoErr}</p> : null}
        </div>
        {err ? <p className="text-red-600">{err}</p> : null}

        <button type="submit" className="rounded bg-zinc-900 px-4 py-2 text-white w-fit">
          Save company details
        </button>
      </form>
    </div>
  );
}
