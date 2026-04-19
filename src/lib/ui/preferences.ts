export const UI_PREFS_STORAGE_KEY = "uiPreferencesV1";

export const APP_THEMES = [
  { id: "sage", label: "Sage grey (default)" },
  { id: "slate", label: "Cool slate" },
  { id: "warm", label: "Warm paper" },
  { id: "blue", label: "Office blue" },
  { id: "emerald", label: "Soft emerald" },
  { id: "violet", label: "Lavender" },
  { id: "rose", label: "Rose quartz" },
  { id: "amber", label: "Amber desk" },
  { id: "teal", label: "Sea mist" },
  { id: "indigo", label: "Indigo ink" },
] as const;

export type AppThemeId = (typeof APP_THEMES)[number]["id"];

export const FONT_SCALES = [
  { id: "sm", label: "Smaller", rem: 0.875 },
  { id: "md", label: "Standard", rem: 1 },
  { id: "lg", label: "Larger", rem: 1.125 },
] as const;

export type FontScaleId = (typeof FONT_SCALES)[number]["id"];

export type UiPreferences = {
  theme: AppThemeId;
  fontScale: FontScaleId;
  /** Tighter padding and slightly narrower task pane */
  compactLayout: boolean;
  /** Show the footer disclaimer line */
  showFooterNote: boolean;
};

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  theme: "sage",
  fontScale: "md",
  compactLayout: false,
  showFooterNote: true,
};

export function parseStoredPreferences(raw: string | null): UiPreferences {
  if (!raw) return { ...DEFAULT_UI_PREFERENCES };
  try {
    const p = JSON.parse(raw) as Partial<UiPreferences>;
    const theme = APP_THEMES.some((t) => t.id === p.theme)
      ? (p.theme as AppThemeId)
      : DEFAULT_UI_PREFERENCES.theme;
    const fontScale = FONT_SCALES.some((f) => f.id === p.fontScale)
      ? (p.fontScale as FontScaleId)
      : DEFAULT_UI_PREFERENCES.fontScale;
    return {
      theme,
      fontScale,
      compactLayout: typeof p.compactLayout === "boolean" ? p.compactLayout : false,
      showFooterNote:
        typeof p.showFooterNote === "boolean" ? p.showFooterNote : true,
    };
  } catch {
    return { ...DEFAULT_UI_PREFERENCES };
  }
}
