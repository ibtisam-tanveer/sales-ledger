import fs from "fs";
import path from "path";

/**
 * Default logo shipped with the app (Facility 24/7). Path is relative to project root.
 */
export const DEFAULT_COMPANY_LOGO_RELATIVE = "public/company/facility-logo.png";

/**
 * Resolve a filesystem path for @react-pdf Image / Excel image embedding.
 * Tries DB-configured path first, then the bundled default if the file exists.
 */
export function resolveCompanyLogoFilePath(
  storedLogoPath: string | null | undefined
): string | undefined {
  const cwd = process.cwd();
  const candidates: string[] = [];

  if (storedLogoPath?.trim()) {
    const t = storedLogoPath.trim();
    if (path.isAbsolute(t)) {
      candidates.push(t);
    } else {
      candidates.push(
        path.join(/* turbopackIgnore: true */ cwd, t.replace(/^\//, ""))
      );
    }
  }

  candidates.push(
    path.join(/* turbopackIgnore: true */ cwd, DEFAULT_COMPANY_LOGO_RELATIVE)
  );

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}
