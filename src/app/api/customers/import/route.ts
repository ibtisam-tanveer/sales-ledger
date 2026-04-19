import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db/connect";
import { Customer } from "@/lib/models/customer";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
    } else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.replace(/^"|"$/g, "").trim());
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) row[h] = vals[idx]?.trim() ?? "";
    });
    rows.push(row);
  }
  return rows;
}

async function parseXlsx(buf: Buffer): Promise<Record<string, string>[]> {
  const wb = new ExcelJS.Workbook();
  // exceljs vs @types/node Buffer generics differ in strict TS; runtime load accepts this buffer.
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) return [];
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = normalizeHeader(String(cell.value ?? ""));
  });
  const rows: Record<string, string>[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, string> = {};
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const h = headers[col - 1];
      if (h) obj[h] = String(cell.value ?? "").trim();
    });
    if (Object.keys(obj).length) rows.push(obj);
  });
  return rows;
}

function cell(r: Record<string, string>, ...aliases: string[]): string {
  for (const a of aliases) {
    const v = r[a]?.trim();
    if (v) return v;
  }
  return "";
}

export async function POST(req: Request) {
  try {
    await connectDb();
    const workspaceId = requireWorkspaceObjectId();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const fn = (file.name || "import.csv").toLowerCase();
    let rows: Record<string, string>[] = [];
    if (fn.endsWith(".xlsx")) {
      rows = await parseXlsx(buf);
    } else {
      rows = parseCsv(buf.toString("utf8"));
    }

    const errors: { row: number; error: string }[] = [];
    let created = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const name = cell(r, "name", "customer name", "customer", "company", "company name");
      if (!name) {
        errors.push({ row: i + 2, error: "Missing name" });
        continue;
      }
      const billingAddress = cell(
        r,
        "billing address",
        "address",
        "billingaddress",
        "addr"
      );
      const externalRef = cell(
        r,
        "external ref",
        "externalref",
        "ref",
        "customer id",
        "customerid"
      );
      try {
        await Customer.create({
          workspaceId,
          name,
          billingAddress,
          externalRef,
        });
        created++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error";
        errors.push({ row: i + 2, error: msg });
      }
    }

    return NextResponse.json({
      created,
      failed: errors.length,
      errors,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
