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

  return (
    <div className="flex min-h-screen flex-col bg-[var(--app-shell-bg)] font-sans text-neutral-900">
      {/* Title bar */}
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--app-border-strong)] bg-gradient-to-b from-[var(--app-header-start)] to-[var(--app-header-end)] px-3 py-1.5 text-neutral-900 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="truncate text-sm font-semibold tracking-tight text-neutral-900 hover:underline sm:text-base"
          >
            Sales Ledger
          </Link>
        </div>
        <Link
          href="/"
          className="shrink-0 rounded border border-[var(--app-home-btn-border)] bg-[var(--app-home-btn-bg)] px-2.5 py-1 text-xs font-medium text-neutral-900 shadow-sm hover:bg-white"
        >
          Home
        </Link>
      </header>

      {/* Toolbar strip — module shortcuts */}
      <div className="flex shrink-0 flex-col border-b border-[var(--app-border-strong)] bg-[var(--app-toolbar-bg)] text-xs text-neutral-700">
        <div
          ref={toolbarNavRef}
          className="relative flex flex-wrap items-center gap-x-1 gap-y-1 px-2 py-1.5"
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
        {(tabs.length > 0 || pathname !== "/") ? (
          <div className="flex min-h-[28px] flex-wrap items-center justify-between gap-2 border-t border-[var(--app-border-muted)] bg-[var(--app-tabs-strip)] px-1 py-0.5">
            <div
              className="flex min-w-0 flex-1 flex-wrap items-center gap-1"
              role="tablist"
              aria-label="Open workspace tabs"
            >
              {tabs.map((t) => {
                const active = pathname === t.href;
                return (
                  <div
                    key={t.href}
                    className={`flex max-w-[200px] items-center rounded-t border border-b-0 text-[11px] ${
                      active
                        ? "border-[var(--app-border-strong)] bg-white font-medium text-neutral-900"
                        : "border-transparent bg-[var(--app-tab-inactive)] text-neutral-700 hover:bg-white/80"
                    }`}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className="min-w-0 truncate px-2 py-0.5 text-left"
                      onClick={() => router.push(t.href)}
                    >
                      {t.label}
                    </button>
                    <button
                      type="button"
                      className="shrink-0 px-1 py-0.5 text-neutral-500 hover:text-neutral-900"
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
                  className="ml-1 shrink-0 rounded border border-neutral-400 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-800 shadow-sm hover:bg-neutral-50"
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
              <div className="flex shrink-0 items-center gap-2 pl-1">
                <span className="hidden text-[10px] text-neutral-600 sm:inline">
                  Clear unsaved input
                </span>
                <button
                  type="button"
                  className="rounded border border-neutral-400 bg-white px-2.5 py-0.5 text-[11px] font-medium text-neutral-900 shadow-sm hover:bg-neutral-50"
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

      <div className="flex min-h-0 flex-1">
        {/* Task pane — left */}
        <aside
          className={`flex shrink-0 flex-col overflow-y-auto border-r border-[var(--app-border-strong)] bg-[var(--app-aside-bg)] text-[13px] shadow-[inset_-1px_0_0_rgba(0,0,0,0.06)] ${compact ? "w-[200px]" : "w-[220px]"}`}
          aria-label="Tasks"
        >
          <div className="border-b border-[var(--app-border-strong)] bg-[var(--app-aside-header)] px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-700">
            Tasks
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
          className={`flex min-w-0 flex-1 flex-col overflow-auto bg-[var(--app-work-bg)] ${compact ? "p-2 sm:p-2" : "p-3 sm:p-4"}`}
        >
          <div
            className={`mx-auto min-h-full w-full max-w-6xl rounded-sm border border-[var(--app-border-strong)] bg-white shadow-md ${compact ? "p-4 sm:p-5" : "p-5 sm:p-6"}`}
          >
            {children}
          </div>
        </div>
      </div>

      {/* Status bar */}
      {prefs.showFooterNote ? (
        <footer className="flex shrink-0 items-center justify-between border-t border-[var(--app-border-strong)] bg-[var(--app-footer-bg)] px-2 py-1 text-[11px] text-neutral-700">
          <span>For indicator only — not Sage 50 Accounts software</span>
          <span className="text-neutral-600">Ready</span>
        </footer>
      ) : (
        <footer className="flex shrink-0 justify-end border-t border-[var(--app-border-strong)] bg-[var(--app-footer-bg)] px-2 py-1 text-[11px] text-neutral-600">
          <span>Ready</span>
        </footer>
      )}
    </div>
  );
}
