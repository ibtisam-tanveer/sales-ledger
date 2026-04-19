import { addDays, parse } from "date-fns";

export type ParsedLine = {
  shiftDate: string;
  description: string;
  unitPrice: number;
  totalHours: number;
};

export type ParsedInvoice = {
  invoiceNumber: string;
  issueDate: Date | null;
  poNumber: string;
  siteAddress: string;
  customerName: string;
  customerAddressLines: string[];
  customerExternalId: string;
  lines: ParsedLine[];
  amountNet: number;
  amountVat: number;
  amountGross: number;
};

function parseUkDate(s: string): Date | null {
  const cleaned = s.trim();
  const d1 = parse(cleaned, "d MMM yyyy", new Date());
  if (!isNaN(d1.getTime())) return d1;
  const d2 = parse(cleaned, "dd MMM yyyy", new Date());
  if (!isNaN(d2.getTime())) return d2;
  return null;
}

function parseMoney(line: string): number | null {
  const m = line.match(/£\s*([\d,]+\.?\d*)/);
  if (!m) return null;
  return parseFloat(m[1].replace(/,/g, ""));
}

/**
 * Heuristic parser for Facility 24/7–style invoice text (see plan samples).
 */
export function parseFacilityInvoiceText(raw: string): ParsedInvoice {
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  let invoiceNumber = "";
  const invMatch = text.match(/Invoice no:\s*([^\n]+)/i);
  if (invMatch) invoiceNumber = invMatch[1].trim();

  let issueDate: Date | null = null;
  const dateMatch = text.match(/Date:\s*([^\n]+)/i);
  if (dateMatch) issueDate = parseUkDate(dateMatch[1]);

  function looksLikePoNumber(s: string): boolean {
    const t = s.trim();
    if (!t) return false;
    // Common patterns seen on these invoices: 2.00.22.1129, 200221129, PO-12345
    if (/^[\d.]{6,}$/.test(t)) return true;
    if (/^PO[\s\-]?\w{3,}$/i.test(t)) return true;
    if (/^[A-Z0-9][A-Z0-9\-./]{4,}$/i.test(t)) return true;
    return false;
  }

  let poNumber = "";
  let siteAddress = "";

  // First, try to parse the "Site | P.O. NUMBER" table row where the values are on the next line.
  const siteRow = text.match(
    /(?:^|\n)Site\s+P\.?\s*O\.?\s*NUMBER\s*\n\s*([^\n]+)/i
  );
  if (siteRow) {
    const line = siteRow[1].trim();
    // Often the extracted text collapses columns into one line like:
    // "56 Westminster    2.00.22.1129"
    // Split on 2+ spaces (or tabs) to separate columns.
    const parts = line.split(/\s{2,}|\t+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const candidatePo = parts[parts.length - 1];
      const candidateSite = parts.slice(0, parts.length - 1).join(" ").trim();
      if (candidateSite) siteAddress = candidateSite;
      if (looksLikePoNumber(candidatePo)) poNumber = candidatePo;
    } else {
      // Some PDFs collapse columns with single spaces. Try: last token as PO.
      const tokens = line.split(/\s+/).map((t) => t.trim()).filter(Boolean);
      if (tokens.length >= 2) {
        const candidatePo = tokens[tokens.length - 1];
        const candidateSite = tokens.slice(0, tokens.length - 1).join(" ").trim();
        if (candidateSite) siteAddress = candidateSite;
        if (looksLikePoNumber(candidatePo)) poNumber = candidatePo;
      } else {
        // If we didn't get a clean split, keep the full line as site.
        siteAddress = line;
      }
    }
  }

  // Fallback: match a "P.O. NUMBER" label on the same line, or capture the next line if it’s blank.
  if (!poNumber) {
    const poMatch =
      text.match(/P\.?\s*O\.?\s*(?:NUMBER|No\.?)\s*[:\s]*([^\n]+)/i) ??
      text.match(/P\.?\s*O\.?\s*(?:NUMBER|No\.?)\s*[:\s]*\n\s*([^\n]+)/i);
    if (poMatch) {
      const v = poMatch[1].trim();
      if (looksLikePoNumber(v)) poNumber = v;
    }
  }

  // Last resort: walk the text line-by-line, find "P.O. NUMBER" header,
  // then look at that line and the next few lines for a plausible PO value.
  if (!poNumber) {
    const linesRaw = text.split("\n").map((l) => l.trim());
    const headerIdx = linesRaw.findIndex((l) => /P\.?\s*O\.?\s*NUMBER/i.test(l));
    if (headerIdx >= 0) {
      const window = linesRaw.slice(headerIdx, headerIdx + 6).filter(Boolean);
      for (const l of window) {
        // If the extractor kept columns on the same line, the PO is often the last token.
        const tokens = l
          .replace(/P\.?\s*O\.?\s*NUMBER/i, "")
          .split(/\s+/)
          .map((t) => t.trim())
          .filter(Boolean);
        // Try last token first, then any token.
        const candidates = [
          tokens[tokens.length - 1],
          ...tokens,
        ].filter((x): x is string => typeof x === "string" && x.length > 0);
        const found = candidates.find((c) => looksLikePoNumber(c));
        if (found) {
          poNumber = found;
          break;
        }
      }
    }
  }

  let customerName = "";
  let customerAddressLines: string[] = [];
  let customerExternalId = "";
  const toMatch = text.match(/Invoice To:\s*([\s\S]*?)(?=\n\s*Date:)/i);
  if (toMatch) {
    const block = toMatch[1].trim();
    const addrLines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (addrLines.length) {
      customerName = addrLines[0].replace(/,$/, "");
      customerAddressLines = addrLines.slice(1);
    }
  }

  const custIdMatch = text.match(/Customer ID:\s*([^\n]+)/i);
  if (custIdMatch) customerExternalId = custIdMatch[1].trim();

  const lines: ParsedLine[] = [];
  const lineRowRe =
    /^(\d{1,2}\.\d{1,2}\.\d{2,4})\s+(.+?)\s+([\d.]+)\s+([\d.]+)\s*$/gm;
  let lm: RegExpExecArray | null;
  while ((lm = lineRowRe.exec(text)) !== null) {
    const desc = lm[2].trim();
    if (/^Shift date$/i.test(desc) || /^Details$/i.test(desc)) continue;
    lines.push({
      shiftDate: lm[1],
      description: desc,
      unitPrice: parseFloat(lm[3]),
      totalHours: parseFloat(lm[4]),
    });
  }

  let amountNet = 0;
  let amountVat = 0;
  let amountGross = 0;

  const subMatch = text.match(/Subtotal\s+£\s*([\d,]+\.?\d*)/i);
  if (subMatch) amountNet = parseFloat(subMatch[1].replace(/,/g, ""));

  const vatMatch = text.match(/VAT\s+£\s*([\d,]+\.?\d*)/i);
  if (vatMatch) amountVat = parseFloat(vatMatch[1].replace(/,/g, ""));

  const totalPatterns = [
    /Total\s+£\s*([\d,]+\.?\d*)/i,
    /Coun5ng Up\s+Total\s+£\s*([\d,]+\.?\d*)/i,
  ];
  for (const re of totalPatterns) {
    const tm = text.match(re);
    if (tm) {
      amountGross = parseFloat(tm[1].replace(/,/g, ""));
      break;
    }
  }

  if (!amountGross) {
    for (const line of text.split("\n")) {
      if (/total/i.test(line) && /£/.test(line)) {
        const v = parseMoney(line);
        if (v != null) amountGross = v;
      }
    }
  }

  return {
    invoiceNumber,
    issueDate,
    poNumber,
    siteAddress,
    customerName,
    customerAddressLines,
    customerExternalId,
    lines,
    amountNet,
    amountVat,
    amountGross,
  };
}

export function defaultDueDate(issueDate: Date): Date {
  return addDays(issueDate, 30);
}

export function sumLineNets(lines: ParsedLine[]): number {
  return lines.reduce((s, l) => s + l.unitPrice * l.totalHours, 0);
}
