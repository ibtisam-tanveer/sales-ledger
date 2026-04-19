import path from "path";
import fs from "fs/promises";

export const STORAGE_ROOT = path.join(process.cwd(), "storage");

export function pdfDir() {
  return path.join(STORAGE_ROOT, "pdfs");
}

export function logoDir() {
  return path.join(STORAGE_ROOT, "logos");
}

export async function ensureStorageDirs() {
  await fs.mkdir(pdfDir(), { recursive: true });
  await fs.mkdir(logoDir(), { recursive: true });
}
