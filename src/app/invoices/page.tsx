"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  usePathname,
  useRouter,
  useSearchParams,
  type ReadonlyURLSearchParams,
} from "next/navigation";
import type { InvoiceImportTemplate } from "@/lib/company-settings/invoice-import-template";
import { INVOICE_IMPORT_PREFERRED_TEMPLATE_KEY } from "@/lib/ui/invoice-import-pref";
import { formatInvoiceDate } from "@/lib/format/dates";
import { invoiceRegisterFilename } from "@/lib/format/download-filename";
import { formatPounds } from "@/lib/format/money";
import { selectDateInputOnFocus } from "@/lib/ui/date-input-focus";
import { TablePagination } from "@/components/TablePagination";

type Inv = {
  _id: string;
  customerId: string;
  customerName: string;
  invoiceNumber: string;
  issueDate: string;
  /** ISO string when posted; null for drafts and legacy rows. */
  postedAt: string | null;
  status: string;
  amountNet: number;
  amountVat: number;
  amountGross: number;
  siteAddress?: string;
  hasPdf?: boolean;
};

type CustomerRow = { _id: string; name: string };

type InvoiceSortKey =
  | "issueDate"
  | "postedAt"
  | "invoiceNumber"
  | "customerName"
  | "siteAddress"
  | "status"
  | "amountGross";

type AmountBounds =
  | { kind: "ok"; min?: number; max?: number }
  | { kind: "invalid" }
  | { kind: "range" };

function amountBounds(fromStr: string, toStr: string): AmountBounds {
  const parse = (s: string) => {
    const t = s.trim();
    if (t === "") return { ok: true as const, v: undefined as number | undefined };
    const n = parseFloat(t.replace(/[£,\s]/g, ""));
    return Number.isFinite(n)
      ? { ok: true as const, v: n }
      : { ok: false as const };
  };
  const a = parse(fromStr);
  const b = parse(toStr);
  if (!a.ok || !b.ok) return { kind: "invalid" };
  if (a.v !== undefined && b.v !== undefined && a.v > b.v) return { kind: "range" };
  return { kind: "ok", min: a.v, max: b.v };
}

const invFilterControlClass =
  "w-full min-w-0 rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-900 shadow-sm placeholder:text-slate-400";

function InvoiceSortableTh(props: {
  label: string;
  sortKeyName: InvoiceSortKey;
  activeKey: InvoiceSortKey;
  sortDir: "asc" | "desc";
  onSort: (key: InvoiceSortKey) => void;
  align?: "left" | "right";
}) {
  const {
    label,
    sortKeyName,
    activeKey,
    sortDir,
    onSort,
    align = "left",
  } = props;
  const active = activeKey === sortKeyName;
  return (
    <th
      className={`border-b border-slate-200 bg-slate-100 px-2 py-2 text-sm font-semibold leading-snug ${align === "right" ? "text-right" : "text-left"}`}
      aria-sort={
        active ? (sortDir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <div className={align === "right" ? "flex justify-end" : undefined}>
        <button
          type="button"
          onClick={() => onSort(sortKeyName)}
          className="inline-flex max-w-full items-center gap-1 rounded-md px-0.5 py-0.5 text-left font-semibold hover:bg-slate-200/90"
        >
          {label}
          <span className="font-normal text-slate-500" aria-hidden>
            {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
          </span>
        </button>
      </div>
    </th>
  );
}

function InvoiceFilterTh(props: {
  children?: ReactNode;
  align?: "left" | "right";
}) {
  const { children, align = "left" } = props;
  return (
    <th
      className={`align-middle border-b border-slate-200 bg-slate-50 px-2 py-1.5 font-normal ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

function DateRangeFilter(props: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  fromAria: string;
  toAria: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="w-7 shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-500">
          From
        </span>
        <input
          type="date"
          aria-label={props.fromAria}
          className={invFilterControlClass}
          value={props.from}
          onFocus={selectDateInputOnFocus}
          onChange={(e) => props.onFrom(e.target.value)}
        />
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="w-7 shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-500">
          To
        </span>
        <input
          type="date"
          aria-label={props.toAria}
          className={invFilterControlClass}
          value={props.to}
          onFocus={selectDateInputOnFocus}
          onChange={(e) => props.onTo(e.target.value)}
        />
      </div>
    </div>
  );
}

function AmountRangeFilter(props: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  fromAria: string;
  toAria: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="w-7 shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-500">
          From
        </span>
        <input
          type="text"
          inputMode="decimal"
          aria-label={props.fromAria}
          placeholder="£0"
          className={invFilterControlClass}
          value={props.from}
          onChange={(e) => props.onFrom(e.target.value)}
        />
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="w-7 shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-500">
          To
        </span>
        <input
          type="text"
          inputMode="decimal"
          aria-label={props.toAria}
          placeholder="£0"
          className={invFilterControlClass}
          value={props.to}
          onChange={(e) => props.onTo(e.target.value)}
        />
      </div>
    </div>
  );
}

const statusStyle: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-900 border-neutral-300",
  open: "bg-neutral-100 text-neutral-900 border-neutral-200",
  partially_paid: "bg-neutral-200 text-neutral-900 border-neutral-400",
  paid: "bg-neutral-300 text-neutral-900 border-neutral-500",
};

function normalizeInvoiceRows(raw: unknown): Inv[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => {
    const r = x as Inv;
    return {
      ...r,
      postedAt: r.postedAt ?? null,
      amountNet: Number(r.amountNet) || 0,
      amountVat: Number(r.amountVat) || 0,
      amountGross: Number(r.amountGross) || 0,
    };
  });
}

function reloadInvoices(setRows: (rows: Inv[]) => void) {
  fetch("/api/invoices")
    .then((r) => r.json())
    .then((invoices) => {
      setRows(normalizeInvoiceRows(invoices));
    });
}

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

export default function InvoiceRegisterPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <InvoiceRegisterInner />
    </Suspense>
  );
}

function InvoiceRegisterInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [rows, setRows] = useState<Inv[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [transferErr, setTransferErr] = useState("");
  const [deleteErr, setDeleteErr] = useState("");
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchErr, setBatchErr] = useState("");
  const [batchCustomerId, setBatchCustomerId] = useState("");
  const [batchPoMode, setBatchPoMode] = useState<"no_change" | "set" | "clear">(
    "no_change"
  );
  const [batchPoValue, setBatchPoValue] = useState("");
  const [batchSiteMode, setBatchSiteMode] = useState<"no_change" | "set" | "clear">(
    "no_change"
  );
  const [batchSiteValue, setBatchSiteValue] = useState("");
  const [batchDueDate, setBatchDueDate] = useState("");
  const [sortKey, setSortKey] = useState<InvoiceSortKey>("issueDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterCustomerId, setFilterCustomerId] = useState("");
  const [issueDateFrom, setIssueDateFrom] = useState("");
  const [issueDateTo, setIssueDateTo] = useState("");
  const [postingDateFrom, setPostingDateFrom] = useState("");
  const [postingDateTo, setPostingDateTo] = useState("");
  const [filterInvoiceNo, setFilterInvoiceNo] = useState("");
  const [filterSite, setFilterSite] = useState("");
  const [grossFrom, setGrossFrom] = useState("");
  const [grossTo, setGrossTo] = useState("");
  const [importTemplates, setImportTemplates] = useState<InvoiceImportTemplate[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [importErr, setImportErr] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportErr, setExportErr] = useState("");
  const importFileRef = useRef<HTMLInputElement>(null);
  const didInitPagingRef = useRef(false);

  /** Read from URL each render — `useSearchParams()` identity may not change on `router.replace`. */
  const page = intParam(sp, "page", 1);
  const pageSize = intParam(sp, "pageSize", 3);

  useEffect(() => {
    Promise.all([
      fetch("/api/invoices").then((r) => r.json()),
      fetch("/api/customers").then((r) => r.json()),
      fetch("/api/company-settings").then((r) => r.json()),
    ]).then(([invoices, custs, settings]) => {
      setRows(normalizeInvoiceRows(invoices));
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

  const issueDateRangeInvalid =
    !!issueDateFrom &&
    !!issueDateTo &&
    issueDateFrom > issueDateTo;

  const postingDateRangeInvalid =
    !!postingDateFrom &&
    !!postingDateTo &&
    postingDateFrom > postingDateTo;

  const narrowed = useMemo(() => {
    let r = filtered;
    if (filterCustomerId) {
      r = r.filter((x) => x.customerId === filterCustomerId);
    }
    if (!issueDateRangeInvalid) {
      const from = issueDateFrom.trim();
      const to = issueDateTo.trim();
      if (from || to) {
        r = r.filter((inv) => {
          const k = inv.issueDate?.slice(0, 10) ?? "";
          if (from && k < from) return false;
          if (to && k > to) return false;
          return true;
        });
      }
    }
    if (!postingDateRangeInvalid) {
      const from = postingDateFrom.trim();
      const to = postingDateTo.trim();
      if (from || to) {
        r = r.filter((inv) => {
          const k = inv.postedAt?.slice(0, 10) ?? "";
          if (!k) return false;
          if (from && k < from) return false;
          if (to && k > to) return false;
          return true;
        });
      }
    }
    const invNoQ = filterInvoiceNo.trim().toLowerCase();
    if (invNoQ) {
      r = r.filter((inv) => inv.invoiceNumber.toLowerCase().includes(invNoQ));
    }
    const siteQ = filterSite.trim().toLowerCase();
    if (siteQ) {
      r = r.filter((inv) => (inv.siteAddress ?? "").toLowerCase().includes(siteQ));
    }
    const grossB = amountBounds(grossFrom, grossTo);
    if (grossB.kind === "ok") {
      r = r.filter((inv) => {
        const v = inv.amountGross;
        if (grossB.min !== undefined && v < grossB.min) return false;
        if (grossB.max !== undefined && v > grossB.max) return false;
        return true;
      });
    }
    return r;
  }, [
    filtered,
    filterCustomerId,
    issueDateFrom,
    issueDateTo,
    issueDateRangeInvalid,
    postingDateFrom,
    postingDateTo,
    postingDateRangeInvalid,
    filterInvoiceNo,
    filterSite,
    grossFrom,
    grossTo,
  ]);

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
    if (searchTerms.length === 0) return narrowed;
    return narrowed.filter((r) => {
      const hay = [
        r.invoiceNumber,
        r.customerName ?? "",
        r.siteAddress ?? "",
        r.status,
        r.issueDate?.slice(0, 10) ?? "",
        formatInvoiceDate(r.issueDate),
        r.postedAt?.slice(0, 10) ?? "",
        r.postedAt ? formatInvoiceDate(r.postedAt) : "",
        String(r.amountNet ?? ""),
        String(r.amountVat ?? ""),
        String(r.amountGross ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      return searchTerms.every((t) => hay.includes(t));
    });
  }, [narrowed, searchTerms]);

  const sortedRows = useMemo(() => {
    const rows = [...filtered2];
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "issueDate":
          cmp =
            new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime();
          break;
        case "postedAt": {
          const ta = a.postedAt ? new Date(a.postedAt).getTime() : null;
          const tb = b.postedAt ? new Date(b.postedAt).getTime() : null;
          if (ta == null && tb == null) cmp = 0;
          else if (ta == null) cmp = 1;
          else if (tb == null) cmp = -1;
          else cmp = ta - tb;
          break;
        }
        case "amountGross":
          cmp = Number(a.amountGross) - Number(b.amountGross);
          break;
        case "invoiceNumber":
          cmp = a.invoiceNumber.localeCompare(b.invoiceNumber, undefined, {
            numeric: true,
          });
          break;
        case "customerName":
          cmp = (a.customerName || "").localeCompare(b.customerName || "", undefined, {
            sensitivity: "base",
          });
          break;
        case "siteAddress":
          cmp = (a.siteAddress || "").localeCompare(b.siteAddress || "", undefined, {
            sensitivity: "base",
          });
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        default:
          break;
      }
      return cmp * dir;
    });
    return rows;
  }, [filtered2, sortKey, sortDir]);

  async function downloadRegisterExport(format: "pdf" | "xlsx") {
    setExportErr("");
    const ids = sortedRows.map((r) => r._id);
    if (ids.length === 0) {
      setExportErr("Nothing to export — adjust filters or search.");
      return;
    }
    setExportBusy(true);
    try {
      const r = await fetch("/api/invoices/register-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, ids }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        setExportErr(typeof d.error === "string" ? d.error : "Export failed");
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = invoiceRegisterFilename(format);
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExportBusy(false);
    }
  }

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
  }, [
    filter,
    search,
    sortKey,
    sortDir,
    filterCustomerId,
    issueDateFrom,
    issueDateTo,
    postingDateFrom,
    postingDateTo,
    filterInvoiceNo,
    filterSite,
    grossFrom,
    grossTo,
    setUrlPagination,
  ]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / Math.max(1, pageSize)));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, safePage, pageSize]);

  function cycleInvoiceSort(key: InvoiceSortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      const descDefault: InvoiceSortKey[] = ["issueDate", "postedAt", "amountGross"];
      setSortDir(descDefault.includes(key) ? "desc" : "asc");
      return;
    }
    setSortDir((d) => (d === "asc" ? "desc" : "asc"));
  }

  function clearHeaderFilters() {
    setFilterCustomerId("");
    setIssueDateFrom("");
    setIssueDateTo("");
    setPostingDateFrom("");
    setPostingDateTo("");
    setFilterInvoiceNo("");
    setFilterSite("");
    setGrossFrom("");
    setGrossTo("");
    setFilter("all");
  }

  const grossAmtBounds = amountBounds(grossFrom, grossTo);

  const amountFilterParseInvalid =
    grossAmtBounds.kind === "invalid" &&
    (grossFrom.trim() || grossTo.trim());

  const headerFiltersActive =
    !!filterCustomerId ||
    !!issueDateFrom ||
    !!issueDateTo ||
    !!postingDateFrom ||
    !!postingDateTo ||
    !!filterInvoiceNo.trim() ||
    !!filterSite.trim() ||
    !!grossFrom.trim() ||
    !!grossTo.trim() ||
    filter !== "all";

  const selectedIdsInView = useMemo(() => {
    const set = new Set(pagedRows.map((r) => r._id));
    return Object.keys(selected).filter((id) => selected[id] && set.has(id));
  }, [pagedRows, selected]);

  const allSelectedInView =
    pagedRows.length > 0 && selectedIdsInView.length === pagedRows.length;

  async function applyBatchChange(ids: string[]) {
    if (ids.length === 0) return;
    setBatchErr("");
    setTransferErr("");
    setDeleteErr("");
    setBatchBusy(true);
    try {
      const patch: Record<string, unknown> = {};
      if (batchCustomerId.trim()) patch.customerId = batchCustomerId.trim();
      if (batchPoMode === "set") patch.poNumber = batchPoValue;
      if (batchPoMode === "clear") patch.poNumber = "";
      if (batchSiteMode === "set") patch.siteAddress = batchSiteValue;
      if (batchSiteMode === "clear") patch.siteAddress = "";
      if (batchDueDate.trim()) patch.dueDate = batchDueDate.trim();

      const r = await fetch("/api/invoices/batch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, patch }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setBatchErr(typeof d.error === "string" ? d.error : "Batch change failed");
        return;
      }

      reloadInvoices(setRows);
      setSelected((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
      setBatchOpen(false);
      setBatchCustomerId("");
      setBatchPoMode("no_change");
      setBatchPoValue("");
      setBatchSiteMode("no_change");
      setBatchSiteValue("");
      setBatchDueDate("");
    } finally {
      setBatchBusy(false);
    }
  }

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
          <p className="max-w-xs text-right text-xs text-slate-600">
            <strong>Download</strong> uses the same filters and sort as the table (all matching
            rows, not only the current page).
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
            <button
              type="button"
              disabled={exportBusy || sortedRows.length === 0}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
              onClick={() => void downloadRegisterExport("pdf")}
            >
              {exportBusy ? "Preparing…" : "Download PDF"}
            </button>
            <button
              type="button"
              disabled={exportBusy || sortedRows.length === 0}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
              onClick={() => void downloadRegisterExport("xlsx")}
            >
              {exportBusy ? "Preparing…" : "Download Excel"}
            </button>
          </div>
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
          {exportErr ? (
            <p className="max-w-md text-right text-xs text-red-700" role="alert">
              {exportErr}
            </p>
          ) : null}
          {importMsg ? (
            <p className="max-w-md text-right text-xs text-slate-700">{importMsg}</p>
          ) : null}
          {importErr ? (
            <pre className="max-h-32 max-w-md overflow-auto whitespace-pre-wrap text-left text-xs text-red-700">
              {importErr}
            </pre>
          ) : null}
        </div>
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
              Showing {sortedRows.length} of {narrowed.length} after filters
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
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={selectedIdsInView.length === 0}
            onClick={() => {
              setBatchErr("");
              setBatchOpen((v) => !v);
            }}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
          >
            Batch change
          </button>
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
      </div>
      {batchOpen ? (
        <div className="rounded border border-slate-200 bg-white p-3 text-sm shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-medium text-slate-900">Batch change selected invoices</p>
              <p className="text-xs text-slate-600">
                Applies to <strong>{selectedIdsInView.length}</strong> invoice
                {selectedIdsInView.length === 1 ? "" : "s"} in the current view.
              </p>
            </div>
            <button
              type="button"
              className="w-fit rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
              onClick={() => setBatchOpen(false)}
            >
              Close
            </button>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 font-medium text-slate-800">
              Move to customer (optional)
              <select
                className="rounded border border-slate-300 bg-white px-2 py-2 text-slate-900"
                value={batchCustomerId}
                onChange={(e) => setBatchCustomerId(e.target.value)}
              >
                <option value="">No change</option>
                {customers.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 font-medium text-slate-800">
              Due date (optional)
              <input
                type="date"
                className="rounded border border-slate-300 bg-white px-2 py-2 text-slate-900"
                value={batchDueDate}
                onFocus={selectDateInputOnFocus}
                onChange={(e) => setBatchDueDate(e.target.value)}
              />
            </label>

            <div className="grid gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-800">PO number</span>
                <select
                  className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
                  value={batchPoMode}
                  onChange={(e) => setBatchPoMode(e.target.value as typeof batchPoMode)}
                  aria-label="PO number change mode"
                >
                  <option value="no_change">No change</option>
                  <option value="set">Set value</option>
                  <option value="clear">Clear</option>
                </select>
              </div>
              <input
                type="text"
                className="rounded border border-slate-300 bg-white px-2 py-2 text-slate-900 disabled:bg-slate-100"
                placeholder={batchPoMode === "set" ? "Enter PO number" : "—"}
                disabled={batchPoMode !== "set"}
                value={batchPoValue}
                onChange={(e) => setBatchPoValue(e.target.value)}
              />
            </div>

            <div className="grid gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-800">Site address</span>
                <select
                  className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
                  value={batchSiteMode}
                  onChange={(e) => setBatchSiteMode(e.target.value as typeof batchSiteMode)}
                  aria-label="Site address change mode"
                >
                  <option value="no_change">No change</option>
                  <option value="set">Set value</option>
                  <option value="clear">Clear</option>
                </select>
              </div>
              <textarea
                className="min-h-[42px] rounded border border-slate-300 bg-white px-2 py-2 text-slate-900 disabled:bg-slate-100"
                placeholder={batchSiteMode === "set" ? "Enter site address" : "—"}
                disabled={batchSiteMode !== "set"}
                value={batchSiteValue}
                onChange={(e) => setBatchSiteValue(e.target.value)}
              />
            </div>
          </div>

          {batchErr ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-red-600" role="alert">
              {batchErr}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={batchBusy}
              onClick={() => setBatchOpen(false)}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={batchBusy}
              onClick={() => void applyBatchChange(selectedIdsInView)}
              className="rounded bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {batchBusy ? "Applying…" : "Apply changes"}
            </button>
          </div>
        </div>
      ) : null}
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
      {issueDateRangeInvalid ? (
        <p className="text-sm text-red-600" role="alert">
          Issue from must be on or before issue to (date filters in the table header are ignored
          until fixed).
        </p>
      ) : null}
      {postingDateRangeInvalid ? (
        <p className="text-sm text-red-600" role="alert">
          Posting from must be on or before posting to (posting date filters are ignored until
          fixed).
        </p>
      ) : null}
      {amountFilterParseInvalid ? (
        <p className="text-sm text-red-600" role="alert">
          Amount filters must be valid numbers (or left blank). Matching is paused until corrected.
        </p>
      ) : null}
      {grossAmtBounds.kind === "range" ? (
        <p className="text-sm text-red-600" role="alert">
          Gross (£) from must be less than or equal to gross to (that range filter is ignored until
          fixed).
        </p>
      ) : null}
      {headerFiltersActive &&
      !issueDateRangeInvalid &&
      !postingDateRangeInvalid &&
      !amountFilterParseInvalid ? (
        <p className="text-xs text-slate-500">
          {narrowed.length} invoice{narrowed.length === 1 ? "" : "s"} match the header filters
          (of {rows.length} total).
        </p>
      ) : null}
      <div className="overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col style={{ width: "3%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "26%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "9%" }} />
          </colgroup>
          <thead className="text-left text-slate-700">
            <tr>
              <th
                rowSpan={2}
                className="align-middle border-b border-slate-200 bg-slate-100 px-2 py-2 font-semibold"
              >
                <div className="flex flex-col items-stretch gap-2">
                  <input
                    type="checkbox"
                    aria-label="Select all invoices in view"
                    checked={allSelectedInView}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setSelected((prev) => {
                        const next = { ...prev };
                        for (const r of pagedRows) next[r._id] = on;
                        return next;
                      });
                    }}
                  />
                  <button
                    type="button"
                    disabled={!headerFiltersActive}
                    onClick={clearHeaderFilters}
                    className="text-left text-xs font-medium leading-tight text-slate-600 underline decoration-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40"
                  >
                    Clear filters
                  </button>
                </div>
              </th>
              <InvoiceSortableTh
                label="Date"
                sortKeyName="issueDate"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={cycleInvoiceSort}
              />
              <InvoiceSortableTh
                label="Posted"
                sortKeyName="postedAt"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={cycleInvoiceSort}
              />
              <InvoiceSortableTh
                label="Inv no."
                sortKeyName="invoiceNumber"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={cycleInvoiceSort}
              />
              <InvoiceSortableTh
                label="Customer"
                sortKeyName="customerName"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={cycleInvoiceSort}
              />
              <InvoiceSortableTh
                label="Site"
                sortKeyName="siteAddress"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={cycleInvoiceSort}
              />
              <InvoiceSortableTh
                label="Status"
                sortKeyName="status"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={cycleInvoiceSort}
              />
              <InvoiceSortableTh
                label="Gross (£)"
                sortKeyName="amountGross"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={cycleInvoiceSort}
                align="right"
              />
              <th
                rowSpan={2}
                className="align-middle border-b border-slate-200 bg-slate-100 px-2 py-2 font-semibold"
              >
                <span className="text-sm font-semibold leading-snug">Action</span>
              </th>
            </tr>
            <tr>
              <InvoiceFilterTh>
                <DateRangeFilter
                  from={issueDateFrom}
                  to={issueDateTo}
                  onFrom={setIssueDateFrom}
                  onTo={setIssueDateTo}
                  fromAria="Filter issue date from"
                  toAria="Filter issue date to"
                />
              </InvoiceFilterTh>
              <InvoiceFilterTh>
                <DateRangeFilter
                  from={postingDateFrom}
                  to={postingDateTo}
                  onFrom={setPostingDateFrom}
                  onTo={setPostingDateTo}
                  fromAria="Filter posting date from"
                  toAria="Filter posting date to"
                />
              </InvoiceFilterTh>
              <InvoiceFilterTh>
                <input
                  type="search"
                  aria-label="Filter by invoice number"
                  placeholder="Contains…"
                  className={invFilterControlClass}
                  value={filterInvoiceNo}
                  onChange={(e) => setFilterInvoiceNo(e.target.value)}
                />
              </InvoiceFilterTh>
              <InvoiceFilterTh>
                <label className="sr-only" htmlFor="inv-filter-customer">
                  Filter by customer
                </label>
                <select
                  id="inv-filter-customer"
                  className={invFilterControlClass}
                  value={filterCustomerId}
                  onChange={(e) => setFilterCustomerId(e.target.value)}
                >
                  <option value="">All customers</option>
                  {customers.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </InvoiceFilterTh>
              <InvoiceFilterTh>
                <input
                  type="search"
                  aria-label="Filter by site"
                  placeholder="Contains…"
                  className={invFilterControlClass}
                  value={filterSite}
                  onChange={(e) => setFilterSite(e.target.value)}
                />
              </InvoiceFilterTh>
              <InvoiceFilterTh>
                <label className="sr-only" htmlFor="inv-filter-status">
                  Filter by status
                </label>
                <select
                  id="inv-filter-status"
                  className={`${invFilterControlClass} capitalize`}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">All statuses</option>
                  <option value="draft">Draft</option>
                  <option value="open">Open</option>
                  <option value="partially_paid">Part paid</option>
                  <option value="paid">Paid</option>
                </select>
              </InvoiceFilterTh>
              <InvoiceFilterTh align="right">
                <AmountRangeFilter
                  from={grossFrom}
                  to={grossTo}
                  onFrom={setGrossFrom}
                  onTo={setGrossTo}
                  fromAria="Filter gross amount from"
                  toAria="Filter gross amount to"
                />
              </InvoiceFilterTh>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                  {rows.length === 0
                    ? "No invoices yet."
                    : filtered.length === 0
                      ? "No invoices match this status."
                      : narrowed.length === 0
                        ? "No invoices match the current header filters."
                        : "No invoices match your search."}
                </td>
              </tr>
            ) : (
              pagedRows.map((r) => (
                <tr key={r._id} className="border-b border-slate-100 hover:bg-slate-50/80">
                  <td className="align-top px-2 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select invoice ${r.invoiceNumber}`}
                      checked={!!selected[r._id]}
                      onChange={(e) =>
                        setSelected((prev) => ({ ...prev, [r._id]: e.target.checked }))
                      }
                    />
                  </td>
                  <td className="align-top px-2 py-2 text-slate-800">
                    {formatInvoiceDate(r.issueDate)}
                  </td>
                  <td className="align-top px-2 py-2 text-slate-800">
                    {r.postedAt ? formatInvoiceDate(r.postedAt) : "—"}
                  </td>
                  <td className="align-top px-2 py-2 font-medium text-slate-900">
                    {r.invoiceNumber}
                  </td>
                  <td className="min-w-0 align-top px-2 py-2 text-slate-800">
                    <div className="min-w-0">
                      <label className="sr-only" htmlFor={`cust-${r._id}`}>
                        Customer (ledger)
                      </label>
                      {customers.length === 0 ? (
                        <span className="text-xs leading-snug text-amber-800">
                          Add customers under{" "}
                          <Link href="/customers" className="font-medium underline">
                            Customer records
                          </Link>
                          .
                        </span>
                      ) : (
                        <>
                          <p
                            className="mb-1 text-sm font-medium leading-snug text-slate-900 break-words"
                            title={r.customerName}
                          >
                            {r.customerName}
                          </p>
                          <select
                            id={`cust-${r._id}`}
                            className="w-full min-w-0 max-w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-900"
                            title="Change customer ledger"
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
                        </>
                      )}
                    </div>
                  </td>
                  <td className="min-w-0 align-top px-2 py-2 text-slate-600">
                    <p
                      className="text-sm font-normal leading-snug break-words whitespace-pre-wrap"
                      title={r.siteAddress || undefined}
                    >
                      {r.siteAddress?.trim() ? r.siteAddress : "—"}
                    </p>
                  </td>
                  <td className="align-top px-2 py-2">
                    <span
                      className={`inline-block max-w-full rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${
                        statusStyle[r.status] ?? "bg-slate-100 text-slate-800"
                      }`}
                    >
                      {r.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="align-top px-2 py-2 text-right text-sm tabular-nums text-slate-800">
                    {formatPounds(Number(r.amountGross))}
                  </td>
                  <td className="align-top px-2 py-2">
                    <div className="flex flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-0.5">
                      <Link
                        href={`/invoices/${r._id}/review`}
                        className="text-sm font-medium text-neutral-800 hover:underline"
                      >
                        {r.status === "draft" ? "Review" : "Edit"}
                      </Link>
                      {r.hasPdf ? (
                        <a
                          href={`/api/invoices/${r._id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-neutral-800 hover:underline"
                        >
                          View PDF
                        </a>
                      ) : (
                        <span className="text-sm text-slate-400">No PDF</span>
                      )}
                      {r.status === "draft" ? (
                        <button
                          type="button"
                          onClick={() => void deleteDraftInvoice(r)}
                          disabled={deleteBusyId === r._id}
                          className="text-sm font-medium text-red-700 hover:underline disabled:opacity-50"
                        >
                          {deleteBusyId === r._id ? "Deleting…" : "Delete"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void deleteDraftInvoice(r)}
                          disabled={deleteBusyId === r._id}
                          className="text-sm font-medium text-red-700 hover:underline disabled:opacity-50"
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

      <TablePagination
        total={sortedRows.length}
        page={safePage}
        pageSize={pageSize}
        itemLabel="invoices"
        onPage={(p) => setUrlPagination({ page: p })}
        onPageSize={(s) => setUrlPagination({ page: 1, pageSize: s })}
      />
    </div>
  );
}
