"use client";

import Link from "next/link";
import { useUiPreferences } from "@/contexts/UiPreferencesContext";
import {
  APP_THEMES,
  FONT_SCALES,
  type AppThemeId,
  type FontScaleId,
} from "@/lib/ui/preferences";

export default function AppearanceSettingsPage() {
  const { prefs, updatePrefs } = useUiPreferences();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Appearance &amp; display</h1>
        <p className="mt-1 text-sm text-slate-600">
          These options apply only on this browser. They adjust the shell (navigation, colours,
          and default text size).
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
        <label className="grid gap-1 font-medium text-slate-800">
          Colour theme
          <select
            className="rounded border border-slate-300 bg-white px-2 py-2 text-slate-900"
            value={prefs.theme}
            onChange={(e) => updatePrefs({ theme: e.target.value as AppThemeId })}
          >
            {APP_THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 font-medium text-slate-800">
          Base font size
          <select
            className="rounded border border-slate-300 bg-white px-2 py-2 text-slate-900"
            value={prefs.fontScale}
            onChange={(e) =>
              updatePrefs({ fontScale: e.target.value as FontScaleId })
            }
          >
            {FONT_SCALES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={prefs.compactLayout}
            onChange={(e) => updatePrefs({ compactLayout: e.target.checked })}
          />
          <span>
            <span className="font-medium text-slate-800">Compact layout</span>
            <span className="block text-xs font-normal text-slate-600">
              Narrower task list and tighter padding in the work area.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={prefs.showFooterNote}
            onChange={(e) => updatePrefs({ showFooterNote: e.target.checked })}
          />
          <span>
            <span className="font-medium text-slate-800">Show footer disclaimer</span>
            <span className="block text-xs font-normal text-slate-600">
              The line at the bottom of the window about Sage 50 Accounts.
            </span>
          </span>
        </label>

        <p className="text-xs text-slate-500">
          Changes apply immediately. Session-only form drafts on other pages use{" "}
          <kbd className="rounded bg-slate-100 px-1">Cancel</kbd> in the tab bar — unrelated to
          these settings.
        </p>
      </div>

      <p className="text-sm text-slate-600">
        <Link href="/settings/company" className="font-medium text-neutral-800 hover:underline">
          Company details (UK)
        </Link>
      </p>
    </div>
  );
}
