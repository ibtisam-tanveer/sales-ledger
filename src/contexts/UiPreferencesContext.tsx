"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_UI_PREFERENCES,
  parseStoredPreferences,
  type UiPreferences,
  UI_PREFS_STORAGE_KEY,
} from "@/lib/ui/preferences";

type Ctx = {
  prefs: UiPreferences;
  setPrefs: (next: UiPreferences | ((prev: UiPreferences) => UiPreferences)) => void;
  updatePrefs: (patch: Partial<UiPreferences>) => void;
};

const UiPreferencesContext = createContext<Ctx | null>(null);

function loadPrefs(): UiPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_UI_PREFERENCES };
  return parseStoredPreferences(localStorage.getItem(UI_PREFS_STORAGE_KEY));
}

function applyDom(prefs: UiPreferences): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.appTheme = prefs.theme;
  root.dataset.fontScale = prefs.fontScale;
  root.dataset.uiCompact = prefs.compactLayout ? "true" : "false";
  const scale = prefs.fontScale === "sm" ? "0.875rem" : prefs.fontScale === "lg" ? "1.125rem" : "1rem";
  root.style.fontSize = scale;
}

export function UiPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefsState] = useState<UiPreferences>(DEFAULT_UI_PREFERENCES);

  useEffect(() => {
    const loaded = loadPrefs();
    setPrefsState(loaded);
  }, []);

  useEffect(() => {
    applyDom(prefs);
    try {
      localStorage.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // ignore
    }
  }, [prefs]);

  const setPrefs = useCallback(
    (next: UiPreferences | ((prev: UiPreferences) => UiPreferences)) => {
      setPrefsState((prev) =>
        typeof next === "function" ? next(prev) : next
      );
    },
    []
  );

  const updatePrefs = useCallback((patch: Partial<UiPreferences>) => {
    setPrefsState((prev) => ({ ...prev, ...patch }));
  }, []);

  const value = useMemo(
    () => ({ prefs, setPrefs, updatePrefs }),
    [prefs, setPrefs, updatePrefs]
  );

  return (
    <UiPreferencesContext.Provider value={value}>
      {children}
    </UiPreferencesContext.Provider>
  );
}

export function useUiPreferences(): Ctx {
  const ctx = useContext(UiPreferencesContext);
  if (!ctx) {
    throw new Error("useUiPreferences must be used within UiPreferencesProvider");
  }
  return ctx;
}
