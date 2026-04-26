"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
  type ReadonlyURLSearchParams,
} from "next/navigation";
import { usePersistedPageState } from "@/hooks/usePersistedPageState";
import { TablePagination } from "@/components/TablePagination";

type Site = { _id: string; address: string };

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

export default function SitesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <SitesInner />
    </Suspense>
  );
}

function SitesInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [list, setList] = useState<Site[]>([]);
  const initialDraft = useMemo(
    () => ({
      address: "",
      search: "",
      editingId: null as string | null,
      editValue: "",
    }),
    []
  );
  const [draft, setDraft] = usePersistedPageState(initialDraft);
  const { address, search, editingId, editValue } = draft;
  const [err, setErr] = useState("");

  const [page, setPage] = useState(() => intParam(sp, "page", 1));
  const [pageSize, setPageSize] = useState(() => intParam(sp, "pageSize", 3));
  const didInitPagingRef = useRef(false);

  useEffect(() => {
    setPage(intParam(sp, "page", 1));
    setPageSize(intParam(sp, "pageSize", 3));
  }, [sp]);

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
    return list.filter((s) => {
      const hay = s.address.toLowerCase();
      return searchTerms.every((t) => hay.includes(t));
    });
  }, [list, searchTerms]);

  const setUrlPagination = useCallback(
    (next: { page?: number; pageSize?: number }) => {
      const params = new URLSearchParams(sp.toString());
      if (next.page !== undefined) params.set("page", String(next.page));
      if (next.pageSize !== undefined) params.set("pageSize", String(next.pageSize));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, sp]
  );

  useEffect(() => {
    if (!didInitPagingRef.current) {
      didInitPagingRef.current = true;
      return;
    }
    setUrlPagination({ page: 1 });
  }, [search, setUrlPagination]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredList.length / Math.max(1, pageSize))
  );
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pagedSites = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredList.slice(start, start + pageSize);
  }, [filteredList, safePage, pageSize]);

  async function load() {
    const r = await fetch("/api/site-addresses/registry");
    const d = await r.json();
    if (r.ok) setList(d);
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const r = await fetch("/api/site-addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    const d = await r.json();
    if (!r.ok) {
      setErr(d.error ?? "Failed");
      return;
    }
    setDraft((d) => ({ ...d, address: "" }));
    load();
  }

  async function saveEdit(id: string) {
    setErr("");
    const r = await fetch(`/api/site-addresses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: editValue }),
    });
    const d = await r.json();
    if (!r.ok) {
      setErr(d.error ?? "Failed");
      return;
    }
    setDraft((d) => ({ ...d, editingId: null }));
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this site address from the saved list?")) return;
    setErr("");
    const r = await fetch(`/api/site-addresses/${id}`, { method: "DELETE" });
    const d = await r.json();
    if (!r.ok) {
      setErr(d.error ?? "Failed");
      return;
    }
    load();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Site addresses</h1>
        <p className="mt-1 text-sm text-slate-600">
          Saved sites for invoice autocomplete — same idea as customer records.
        </p>
      </div>

      <form onSubmit={add} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-slate-800">Add site address</p>
        <input
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900"
          placeholder="Full site address or label"
          value={address}
          onChange={(e) =>
            setDraft((d) => ({ ...d, address: e.target.value }))
          }
          required
        />
        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        <button
          type="submit"
          className="rounded bg-zinc-900 px-4 py-2 text-sm text-white"
        >
          Save
        </button>
      </form>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <label className="grid gap-1 text-sm font-medium text-slate-800">
          Search site addresses
          <input
            type="search"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900"
            placeholder="Search any field…"
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
        {filteredList.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-slate-500">
            {list.length === 0
              ? "No saved site addresses yet."
              : "No site addresses match your search."}
          </li>
        ) : (
          pagedSites.map((s) => (
            <li key={s._id} className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              {editingId === s._id ? (
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <input
                    className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 text-slate-900"
                    value={editValue}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, editValue: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className="rounded bg-neutral-600 px-3 py-1.5 text-white hover:bg-neutral-700"
                    onClick={() => saveEdit(s._id)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="rounded border border-slate-300 px-3 py-1.5 text-slate-800"
                    onClick={() =>
                      setDraft((d) => ({ ...d, editingId: null }))
                    }
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap text-slate-900">
                    {s.address}
                  </span>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className="text-sm font-medium text-neutral-800 hover:underline"
                      onClick={() => {
                        setDraft((d) => ({
                          ...d,
                          editingId: s._id,
                          editValue: s.address,
                        }));
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-sm font-medium text-red-700 hover:underline"
                      onClick={() => remove(s._id)}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))
        )}
      </ul>

      <TablePagination
        total={filteredList.length}
        page={safePage}
        pageSize={pageSize}
        itemLabel="site addresses"
        onPage={(p) => setUrlPagination({ page: p })}
        onPageSize={(s) => setUrlPagination({ page: 1, pageSize: s })}
      />
    </div>
  );
}
