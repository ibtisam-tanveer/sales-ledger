import path from "path";
import { pdfDir } from "@/lib/storage/paths";

/** True if absolute path is a file under the app PDF storage directory. */
export function isPdfUnderStorageDir(absPath: string): boolean {
  const pdfs = path.resolve(pdfDir());
  const r = path.resolve(absPath);
  const rel = path.relative(pdfs, r);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export function resolveStoredPath(stored: string): string {
  const t = stored.trim();
  if (!t) return "";
  return path.isAbsolute(t) ? path.resolve(t) : path.resolve(process.cwd(), t.replace(/^\//, ""));
}
