"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { navLabelForPath } from "@/lib/nav/sections";
import { clearPageDraftStorage } from "@/lib/workspace/page-draft";

const STORAGE_KEY = "workspaceTabsV1";

export type WorkspaceTab = { href: string; label: string };

type Ctx = {
  tabs: WorkspaceTab[];
  closeTab: (href: string) => void;
  /** Clears all open tabs, draft storage for those routes, and navigates home. */
  clearAllTabs: () => void;
};

const WorkspaceTabsContext = createContext<Ctx | null>(null);

function loadTabs(): WorkspaceTab[] {
  if (typeof window === "undefined") return [];
  try {
    // localStorage so tabs persist across browser tabs/windows and reloads
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is WorkspaceTab =>
        t &&
        typeof t === "object" &&
        typeof (t as WorkspaceTab).href === "string" &&
        typeof (t as WorkspaceTab).label === "string"
    );
  } catch {
    return [];
  }
}

export function WorkspaceTabsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [tabs, setTabs] = useState<WorkspaceTab[]>(loadTabs);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
    } catch {
      // ignore
    }
  }, [tabs]);

  useEffect(() => {
    if (pathname === "/") return;
    setTabs((prev) => {
      if (prev.some((t) => t.href === pathname)) return prev;
      return [
        ...prev,
        { href: pathname, label: navLabelForPath(pathname) },
      ];
    });
  }, [pathname]);

  const closeTab = useCallback(
    (href: string) => {
      clearPageDraftStorage(href);
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.href === href);
        const next = prev.filter((t) => t.href !== href);
        if (pathname === href) {
          if (next.length > 0) {
            const fallback = next[Math.max(0, idx - 1)] ?? next[0];
            router.push(fallback.href);
          } else {
            router.push("/");
          }
        }
        return next;
      });
    },
    [pathname, router]
  );

  const clearAllTabs = useCallback(() => {
    for (const t of tabs) {
      clearPageDraftStorage(t.href);
    }
    if (pathname !== "/") {
      clearPageDraftStorage(pathname);
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    } catch {
      // ignore
    }
    setTabs([]);
    router.push("/");
  }, [tabs, pathname, router]);

  const value = useMemo(
    () => ({ tabs, closeTab, clearAllTabs }),
    [tabs, closeTab, clearAllTabs]
  );

  return (
    <WorkspaceTabsContext.Provider value={value}>
      {children}
    </WorkspaceTabsContext.Provider>
  );
}

export function useWorkspaceTabs(): Ctx {
  const ctx = useContext(WorkspaceTabsContext);
  if (!ctx) {
    throw new Error("useWorkspaceTabs must be used within WorkspaceTabsProvider");
  }
  return ctx;
}
