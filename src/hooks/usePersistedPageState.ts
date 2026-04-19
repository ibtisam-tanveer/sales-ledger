"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CANCEL_PAGE_DRAFT_EVENT,
  clearPageDraftStorage,
} from "@/lib/workspace/page-draft";

/**
 * Persists page-local form state so switching workspace tabs does not clear unsaved input.
 * Keyed by current pathname.
 * Pass a stable `initial` (e.g. from useMemo(() => ({ ... }), [])) so reload merges correctly.
 */
export function usePersistedPageState<T extends Record<string, unknown>>(
  initial: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const pathname = usePathname();

  function load(path: string): T {
    const key = `pageDraft:${path}`;
    try {
      // localStorage so drafts persist across browser restarts (tabs already do)
      const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<T>;
        return { ...initial, ...parsed } as T;
      }
    } catch {
      // ignore
    }
    return initial;
  }

  // Load synchronously to avoid visible "value changes" after mount.
  const [state, setState] = useState<T>(() => load(pathname));

  useEffect(() => {
    setState(load(pathname));
  }, [pathname, initial]);

  useEffect(() => {
    function onCancelDraft() {
      clearPageDraftStorage(pathname);
      setState(initial);
    }
    window.addEventListener(CANCEL_PAGE_DRAFT_EVENT, onCancelDraft);
    return () => window.removeEventListener(CANCEL_PAGE_DRAFT_EVENT, onCancelDraft);
  }, [pathname, initial]);

  useEffect(() => {
    const key = `pageDraft:${pathname}`;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // ignore quota / private mode
    }
  }, [pathname, state]);

  return [state, setState];
}
