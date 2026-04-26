"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useUiPreferences } from "@/contexts/UiPreferencesContext";
import { useWorkspaceTabs } from "@/contexts/WorkspaceTabsContext";
import { NAV_SECTIONS } from "@/lib/nav/sections";
import {
  CANCEL_PAGE_DRAFT_EVENT,
  clearPageDraftStorage,
} from "@/lib/workspace/page-draft";

type Section = (typeof NAV_SECTIONS)[number];

function itemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function sectionHasActive(pathname: string, section: Section): boolean {
  return section.items.some((i) => itemActive(pathname, i.href));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { tabs, closeTab, clearAllTabs } = useWorkspaceTabs();
  const { prefs } = useUiPreferences();
  const compact = prefs.compactLayout;
  const isLogin = pathname === "/login";

  const [open, setOpen] = useState<Record<string, boolean>>(() => ({
    customer: true,
    bank: true,
    reports: true,
    settings: true,
  }));

  useEffect(() => {
    setOpen((prev) => {
      const next = { ...prev };
      for (const s of NAV_SECTIONS) {
        if (sectionHasActive(pathname, s)) next[s.id] = true;
      }
      return next;
    });
  }, [pathname]);

  /** Which toolbar module menu is open (Customer, Bank, …). */
  const [toolbarMenuId, setToolbarMenuId] = useState<string | null>(null);
  const toolbarNavRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!toolbarMenuId) return;
    function onPointerDown(e: PointerEvent) {
      const el = toolbarNavRef.current;
      if (el && !el.contains(e.target as Node)) {
        setToolbarMenuId(null);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setToolbarMenuId(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [toolbarMenuId]);

  useEffect(() => {
    setToolbarMenuId(null);
  }, [pathname]);

  /** Tasks pane is a slide-over on small screens so the document area can use full width. */
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileNavOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  function closeMobileNav() {
    setMobileNavOpen(false);
  }

  if (isLogin) {
    return (
      <div className="flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden bg-[var(--app-shell-bg)] font-sans text-neutral-900">
        <main className="flex flex-1 items-center justify-center px-4">
          <div className="w-full max-w-lg rounded-lg border border-[var(--app-border-strong)] bg-white p-6 shadow-md">
            {children}
          </div>
        </main>
      </div>
    );
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden bg-[var(--app-shell-bg)] font-sans text-neutral-900">
      {/* Title bar */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--app-border-strong)] bg-gradient-to-b from-[var(--app-header-start)] to-[var(--app-header-end)] px-2 py-1.5 text-neutral-900 shadow-sm sm:px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            type="button"
            className="shrink-0 rounded border border-[var(--app-home-btn-border)] bg-white/90 px-2 py-1 text-xs font-medium text-neutral-900 shadow-sm hover:bg-white md:hidden"
            aria-expanded={mobileNavOpen}
            aria-controls="app-tasks-nav"
            onClick={() => setMobileNavOpen(true)}
          >
            Menu
          </button>
          <Link
            href="/"
            className="min-w-0 truncate text-sm font-semibold tracking-tight text-neutral-900 hover:underline sm:text-base"
          >
            Sales Ledger
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void logout()}
            className="shrink-0 rounded border border-[var(--app-home-btn-border)] bg-white/90 px-2.5 py-1 text-xs font-medium text-neutral-900 shadow-sm hover:bg-white"
          >
            Logout
          </button>
          <Link
            href="/"
            className="shrink-0 rounded border border-[var(--app-home-btn-border)] bg-[var(--app-home-btn-bg)] px-2.5 py-1 text-xs font-medium text-neutral-900 shadow-sm hover:bg-white"
          >
            Home
          </Link>
        </div>
      </header>

      {/* Toolbar strip — module shortcuts */}
      <div className="flex shrink-0 flex-col border-b border-[var(--app-border-strong)] bg-[var(--app-toolbar-bg)] text-xs text-neutral-700">
        {/* Desktop: one row + flyout menus */}
        <div
          ref={toolbarNavRef}
          className="relative hidden flex-wrap items-center gap-x-1 gap-y-1 px-2 py-1.5 md:flex"
        >
          <span className="sr-only">Jump to module — each opens a menu of tasks</span>
          {NAV_SECTIONS.map((section, i) => {
            const menuOpen = toolbarMenuId === section.id;
            const sectionActive = sectionHasActive(pathname, section);
            return (
              <span key={section.id} className="relative flex items-center gap-1">
                {i > 0 ? (
                  <span className="text-neutral-400" aria-hidden>
                    ·
                  </span>
                ) : null}
                <button
                  type="button"
                  className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide hover:bg-black/10 hover:text-neutral-900 ${
                    sectionActive
                      ? "text-neutral-900 underline decoration-neutral-500 underline-offset-2"
                      : "text-neutral-700"
                  } ${menuOpen ? "bg-black/10 text-neutral-900" : ""}`}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  aria-controls={`toolbar-menu-${section.id}`}
                  id={`toolbar-trigger-${section.id}`}
                  onClick={() =>
                    setToolbarMenuId((m) => (m === section.id ? null : section.id))
                  }
                >
                  {section.title}
                </button>
                {menuOpen ? (
                  <div
                    id={`toolbar-menu-${section.id}`}
                    role="menu"
                    aria-labelledby={`toolbar-trigger-${section.id}`}
                    className="absolute left-0 top-full z-[100] mt-0.5 min-w-[min(100vw-2rem,260px)] rounded border border-[var(--app-border-strong)] bg-white py-1 text-left shadow-lg"
                  >
                    {section.subtitle ? (
                      <div className="border-b border-neutral-200 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                        {section.subtitle}
                      </div>
                    ) : null}
                    <ul className="py-0.5">
                      {section.items.map((item) => {
                        const active = itemActive(pathname, item.href);
                        return (
                          <li key={item.href} role="none">
                            <Link
                              href={item.href}
                              role="menuitem"
                              className={`block px-3 py-1.5 text-[12px] leading-snug ${
                                active
                                  ? "bg-neutral-100 font-medium text-neutral-900"
                                  : "text-neutral-800 hover:bg-neutral-50"
                              }`}
                              onClick={() => setToolbarMenuId(null)}
                            >
                              {item.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </span>
            );
          })}
        </div>

        {/* Mobile: collapsible sections — full-width targets, no clipped flyouts */}
        <div className="md:hidden">
          <span className="sr-only">Jump to module — expand a section for tasks</span>
          {NAV_SECTIONS.map((section) => {
            const sectionActive = sectionHasActive(pathname, section);
            return (
              <details
                key={section.id}
                className="border-b border-[var(--app-border-muted)] last:border-b-0 open:bg-black/[0.03] [&[open]_.toolbar-chevron]:rotate-180"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-left text-[12px] font-semibold uppercase tracking-wide text-neutral-800 marker:content-none [&::-webkit-details-marker]:hidden">
                  <span
                    className={
                      sectionActive
                        ? "text-neutral-900 underline decoration-neutral-500 underline-offset-2"
                        : ""
                    }
                  >
                    {section.title}
                  </span>
                  <span
                    className="toolbar-chevron shrink-0 text-[10px] text-neutral-500 transition-transform duration-200"
                    aria-hidden
                  >
                    ▼
                  </span>
                </summary>
                <div className="border-t border-neutral-200/80 bg-white/60 px-2 pb-2 pt-1">
                  {section.subtitle ? (
                    <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                      {section.subtitle}
                    </p>
                  ) : null}
                  <ul className="space-y-0.5">
                    {section.items.map((item) => {
                      const active = itemActive(pathname, item.href);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className={`flex min-h-[44px] items-center rounded-md px-3 py-2 text-[13px] leading-snug ${
                              active
                                ? "bg-neutral-200/90 font-medium text-neutral-900"
                                : "text-neutral-800 active:bg-neutral-100"
                            }`}
                          >
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </details>
            );
          })}
        </div>

        {(tabs.length > 0 || pathname !== "/") ? (
          <div className="flex min-h-0 flex-col gap-1.5 border-t border-[var(--app-border-muted)] bg-[var(--app-tabs-strip)] px-1 py-1.5 sm:min-h-[28px] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2 sm:py-0.5">
            <div
              className="flex min-h-0 min-w-0 flex-1 flex-nowrap items-stretch gap-1 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:thin] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:h-1"
              role="tablist"
              aria-label="Open workspace tabs"
            >
              {tabs.map((t) => {
                const active = pathname === t.href;
                return (
                  <div
                    key={t.href}
                    className={`flex shrink-0 max-w-[min(220px,calc(100vw-2rem))] items-stretch rounded-t border border-b-0 text-[11px] sm:max-w-[200px] ${
                      active
                        ? "border-[var(--app-border-strong)] bg-white font-medium text-neutral-900"
                        : "border-transparent bg-[var(--app-tab-inactive)] text-neutral-700 hover:bg-white/80"
                    }`}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className="min-h-[36px] min-w-0 flex-1 truncate px-2 py-1.5 text-left sm:min-h-0 sm:py-0.5"
                      onClick={() => router.push(t.href)}
                    >
                      {t.label}
                    </button>
                    <button
                      type="button"
                      className="flex min-w-[36px] shrink-0 items-center justify-center px-1 py-1.5 text-neutral-500 hover:text-neutral-900 sm:min-w-0 sm:py-0.5"
                      aria-label={`Close ${t.label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(t.href);
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              {tabs.length > 0 ? (
                <button
                  type="button"
                  className="ml-0.5 shrink-0 self-center rounded border border-neutral-400 bg-white px-3 py-2 text-[11px] font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 sm:ml-1 sm:py-0.5"
                  onClick={() => {
                    if (
                      typeof window !== "undefined" &&
                      !window.confirm("Close all workspace tabs and go to Home?")
                    ) {
                      return;
                    }
                    clearAllTabs();
                  }}
                >
                  Clear all tabs
                </button>
              ) : null}
            </div>
            {pathname !== "/" ? (
              <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 border-t border-neutral-200/90 pt-1.5 sm:w-auto sm:border-t-0 sm:pt-0">
                <span className="hidden text-[10px] text-neutral-600 sm:inline">
                  Clear unsaved input
                </span>
                <button
                  type="button"
                  className="min-h-[40px] min-w-[88px] rounded border border-neutral-400 bg-white px-3 text-[11px] font-medium text-neutral-900 shadow-sm hover:bg-neutral-50 sm:min-h-0 sm:px-2.5 sm:py-0.5"
                  onClick={() => {
                    clearPageDraftStorage(pathname);
                    window.dispatchEvent(new CustomEvent(CANCEL_PAGE_DRAFT_EVENT));
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
        {mobileNavOpen ? (
          <button
            type="button"
            tabIndex={-1}
            className="fixed inset-0 z-[55] bg-black/40 md:hidden"
            aria-label="Close menu"
            onClick={closeMobileNav}
          />
        ) : null}

        {/* Task pane — left (slide-over on small screens) */}
        <aside
          id="app-tasks-nav"
          className={`flex max-h-[100dvh] shrink-0 flex-col overflow-y-auto border-r border-[var(--app-border-strong)] bg-[var(--app-aside-bg)] text-[13px] shadow-[inset_-1px_0_0_rgba(0,0,0,0.06)] max-md:fixed max-md:left-0 max-md:top-0 max-md:z-[60] max-md:w-[min(88vw,300px)] max-md:max-w-[300px] max-md:shadow-xl max-md:transition-transform max-md:duration-200 max-md:ease-out md:static md:z-auto md:h-auto md:max-h-none md:translate-x-0 md:shadow-[inset_-1px_0_0_rgba(0,0,0,0.06)] md:transition-none ${mobileNavOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full"} ${compact ? "md:w-[200px]" : "md:w-[220px]"}`}
          aria-label="Tasks"
        >
          <div className="flex items-center justify-between border-b border-[var(--app-border-strong)] bg-[var(--app-aside-header)] px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-700">
            <span>Tasks</span>
            <button
              type="button"
              className="rounded px-2 py-0.5 text-base leading-none text-neutral-600 hover:bg-black/10 hover:text-neutral-900 md:hidden"
              aria-label="Close tasks menu"
              onClick={closeMobileNav}
            >
              ×
            </button>
          </div>
          <nav className="flex flex-col gap-0.5 p-1.5">
            {NAV_SECTIONS.map((section) => {
              const expanded = open[section.id] ?? true;
              return (
                <div key={section.id} className="mb-1">
                  <button
                    type="button"
                    className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-neutral-800 hover:bg-black/5"
                    onClick={() =>
                      setOpen((s) => ({ ...s, [section.id]: !expanded }))
                    }
                    aria-expanded={expanded}
                  >
                    <span className="w-3 text-[10px] text-neutral-600" aria-hidden>
                      {expanded ? "▼" : "▶"}
                    </span>
                    <span className="font-semibold text-neutral-900">{section.title}</span>
                  </button>
                  {section.subtitle ? (
                    <p className="mb-0.5 pl-5 text-[11px] text-neutral-600">{section.subtitle}</p>
                  ) : null}
                  {expanded ? (
                    <ul className="mt-0.5 space-y-0.5 pl-4">
                      {section.items.map((item) => {
                        const active = itemActive(pathname, item.href);
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              className={`block rounded-r border-l-2 py-1 pl-3 pr-2 leading-snug ${
                                active
                                  ? "border-neutral-500 bg-[#d8d8d8] font-medium text-neutral-900"
                                  : "border-transparent text-neutral-800 hover:bg-white/60"
                              }`}
                              onClick={closeMobileNav}
                            >
                              {item.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </nav>
        </aside>

        {/* Document / work area */}
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto bg-[var(--app-work-bg)] ${compact ? "p-2 sm:p-2" : "p-2 sm:p-4"}`}
        >
          <div
            className={`min-h-full w-full min-w-0 rounded-sm border border-[var(--app-border-strong)] bg-white shadow-md ${compact ? "p-3 sm:p-5" : "p-4 sm:p-6"}`}
          >
            {children}
          </div>
        </div>
      </div>

      {/* Status bar */}
      {prefs.showFooterNote ? (
        <footer className="flex shrink-0 flex-col gap-0.5 border-t border-[var(--app-border-strong)] bg-[var(--app-footer-bg)] px-2 py-1 text-[11px] text-neutral-700 sm:flex-row sm:items-center sm:justify-between">
          <span className="min-w-0 leading-snug">
            For indicator only — not Sage 50 Accounts software
          </span>
          <span className="shrink-0 text-neutral-600">Ready</span>
        </footer>
      ) : (
        <footer className="flex shrink-0 justify-end border-t border-[var(--app-border-strong)] bg-[var(--app-footer-bg)] px-2 py-1 text-[11px] text-neutral-600">
          <span>Ready</span>
        </footer>
      )}
    </div>
  );
}
