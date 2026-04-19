import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { v4 as uuid } from "uuid";
import { connectDb } from "@/lib/db/connect";
import { getCompanySettings } from "@/lib/company-settings/service";
import { resolveCompanyLogoFilePath } from "@/lib/company-settings/resolve-logo-path";
import { ensureStorageDirs, logoDir } from "@/lib/storage/paths";

const MAX_BYTES = 2 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

function extFromMime(m: string): string | undefined {
  const base = m.split(";")[0]?.trim().toLowerCase() ?? "";
  return MIME_EXT[base];
}

/** Safe read: resolved file must stay under the project root. */
function isPathAllowedForRead(filePath: string): boolean {
  const cwd = process.cwd();
  const r = path.resolve(filePath);
  const rel = path.relative(cwd, r);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

async function removePreviousUploadIfAny(storedRelative: string | undefined) {
  if (!storedRelative?.trim()) return;
  const abs = path.isAbsolute(storedRelative)
    ? path.resolve(storedRelative)
    : path.resolve(process.cwd(), storedRelative.replace(/^\//, ""));
  const logos = path.resolve(logoDir());
  const rel = path.relative(logos, abs);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return;
  try {
    await fs.unlink(abs);
  } catch {
    /* ignore */
  }
}

export async function GET() {
  try {
    await connectDb();
    const doc = await getCompanySettings();
    const resolved = resolveCompanyLogoFilePath(doc.logoPath);
    if (!resolved || !isPathAllowedForRead(resolved)) {
      return new NextResponse(null, { status: 404 });
    }
    const buf = await fs.readFile(resolved);
    const lower = resolved.toLowerCase();
    let ct = "application/octet-stream";
    if (lower.endsWith(".png")) ct = "image/png";
    else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) ct = "image/jpeg";
    else if (lower.endsWith(".gif")) ct = "image/gif";
    else if (lower.endsWith(".webp")) ct = "image/webp";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": ct,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectDb();
    await ensureStorageDirs();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    const mime = (file.type || "").toLowerCase();
    const ext = extFromMime(mime);
    if (!ext) {
      return NextResponse.json(
        { error: "Unsupported image type (use PNG, JPEG, GIF, or WebP)" },
        { status: 400 }
      );
    }
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 2 MB)" }, { status: 400 });
    }
    const filename = `${uuid()}${ext}`;
    const destAbs = path.join(logoDir(), filename);
    const destRelPosix = `storage/logos/${filename}`;

    const doc = await getCompanySettings();
    await removePreviousUploadIfAny(doc.logoPath);
    await fs.writeFile(destAbs, buf);
    doc.logoPath = destRelPosix;
    await doc.save();

    return NextResponse.json(doc);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await connectDb();
    const doc = await getCompanySettings();
    await removePreviousUploadIfAny(doc.logoPath);
    doc.logoPath = "";
    await doc.save();
    return NextResponse.json(doc);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
