/** localStorage/sessionStorage key prefix for per-route form drafts (see usePersistedPageState). */
export const PAGE_DRAFT_PREFIX = "pageDraft:";

export function pageDraftKey(pathname: string): string {
  return `${PAGE_DRAFT_PREFIX}${pathname}`;
}

/** Clears saved draft for a route (both storages). */
export function clearPageDraftStorage(pathname: string): void {
  const key = pageDraftKey(pathname);
  try {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** Fired after storage is cleared; pages should reset local state to match server defaults. */
export const CANCEL_PAGE_DRAFT_EVENT = "workspace:cancel-page-draft";
