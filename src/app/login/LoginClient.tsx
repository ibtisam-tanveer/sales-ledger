"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginClient() {
  const sp = useSearchParams();
  const router = useRouter();
  const nextUrl = useMemo(() => sp.get("next") || "/", [sp]);

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(typeof d.error === "string" ? d.error : "Login failed");
        return;
      }
      router.replace(nextUrl);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="text-xl font-semibold text-zinc-900">Sign in</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Enter the app password to continue.
      </p>

      <form
        onSubmit={(e) => void submit(e)}
        className="mt-4 space-y-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
      >
        <label className="grid gap-1 text-sm font-medium text-zinc-800">
          Password
          <input
            type="password"
            className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </label>

        {err ? (
          <p className="text-sm text-red-600" role="alert">
            {err}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy || !password}
          className="w-full rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

