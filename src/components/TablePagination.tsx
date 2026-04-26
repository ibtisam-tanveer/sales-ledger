"use client";

import { useMemo } from "react";

export function TablePagination(props: {
  total: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
  className?: string;
}) {
  const {
    total,
    page,
    pageSize,
    onPage,
    onPageSize,
    pageSizeOptions = [3, 10, 25, 50, 100],
    itemLabel = "rows",
    className,
  } = props;

  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(total, safePage * pageSize);

  const canPrev = safePage > 1;
  const canNext = safePage < totalPages;

  const sizeOpts = useMemo(() => {
    const set = new Set([...(pageSizeOptions ?? []), pageSize]);
    return [...set].filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  }, [pageSizeOptions, pageSize]);

  function go(p: number) {
    onPage(Math.min(Math.max(1, p), totalPages));
  }

  return (
    <div
      className={
        className ??
        "flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm"
      }
    >
      <div className="text-xs text-slate-600">
        {total === 0 ? (
          <span>0 {itemLabel}</span>
        ) : (
          <span>
            Showing <strong>{from}</strong>–<strong>{to}</strong> of{" "}
            <strong>{total}</strong> {itemLabel}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-slate-700">
          Per page
          <select
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
            value={String(pageSize)}
            onChange={(e) => onPageSize(Math.max(1, parseInt(e.target.value, 10) || pageSize))}
            aria-label="Rows per page"
          >
            {sizeOpts.map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => go(1)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
            aria-label="First page"
          >
            «
          </button>
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => go(safePage - 1)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
            aria-label="Previous page"
          >
            ‹
          </button>
          <span className="px-2 text-xs text-slate-700 tabular-nums">
            Page <strong>{safePage}</strong> / {totalPages}
          </span>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => go(safePage + 1)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
            aria-label="Next page"
          >
            ›
          </button>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => go(totalPages)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
            aria-label="Last page"
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
}

