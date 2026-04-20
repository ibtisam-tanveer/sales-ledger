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

  /**
   * PO refs on Facility PDFs are usually dotted codes like 2.00.22.1169, or numeric-heavy.
   * Do not treat plain words ("Castle", "Wharf") as POs — that was polluting the PO field
   * when text wrapped onto two lines or when the fallback scanned the Site column.
   */
  function looksLikePoNumber(s: string): boolean {
    const t = s.trim();
    if (!t) return false;
    // Facility layout: d.dd.dd.dddd+
    if (/^\d{1,2}\.\d{1,2}\.\d{2}\.\d{3,}$/.test(t)) return true;
    // Long digit / dot only (no letters)
    if (/^[\d.]{8,}$/.test(t)) return true;
    // Explicit PO prefix
    if (/^PO[\s#\-]*[A-Z0-9]/i.test(t)) return true;
    // Alphanumeric ref only if it contains a digit (avoids matching site names)
    if (/[0-9]/.test(t) && /^[A-Z0-9][A-Z0-9\-./]{3,}$/i.test(t)) return true;
    return false;
  }

  /** Prefer stronger PO patterns when choosing among candidates. */
  function poMatchStrength(s: string): number {
    const t = s.trim();
    if (/^\d{1,2}\.\d{1,2}\.\d{2}\.\d{3,}$/.test(t)) return 3;
    if (/^[\d.]{8,}$/.test(t)) return 2;
    if (/[0-9]/.test(t) && /^[A-Z0-9][A-Z0-9\-./]{3,}$/i.test(t)) return 1;
    return 0;
  }

  let poNumber = "";
  let siteAddress = "";

  /**
   * Site + P.O. NUMBER often span multiple lines (site name, postcode, then PO on its own line).
   * A regex that only read two lines dropped the real PO (e.g. 2.00.22.1176) and left "Three60"
   * to be misclassified as the PO elsewhere.
   */
  const siteHeaderMatch = text.match(/(?:^|\n)Site\s+P\.?\s*O\.?\s*NUMBER\s*\n/i);
  if (siteHeaderMatch && siteHeaderMatch.index !== undefined) {
    const afterHeader = text.slice(siteHeaderMatch.index + siteHeaderMatch[0].length);
    const rawLines = afterHeader.split("\n");
    const valueLines: string[] = [];
    const isStopLine = (t: string) =>
      /^Invoice To:/i.test(t) ||
      /^Date:/i.test(t) ||
      /^Customer ID:/i.test(t) ||
      /^Invoice no:/i.test(t) ||
      /^Shift date\b/i.test(t) ||
      /^Details\b/i.test(t) ||
      /^Subtotal\b/i.test(t) ||
      /^Total\b/i.test(t);

    for (const raw of rawLines) {
      const line = raw.trim();
      if (!line) continue;
      if (isStopLine(line)) break;
      valueLines.push(line);
      if (valueLines.length >= 12) break;
    }

    if (valueLines.length === 1) {
      const line = valueLines[0].trim();
      const parts = line.split(/\s{2,}|\t+/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const candidatePo = parts[parts.length - 1];
        const candidateSite = parts.slice(0, parts.length - 1).join(" ").trim();
        if (looksLikePoNumber(candidatePo)) {
          poNumber = candidatePo;
          siteAddress = candidateSite;
        } else {
          siteAddress = line;
        }
      } else {
        const tokens = line.split(/\s+/).map((t) => t.trim()).filter(Boolean);
        if (tokens.length >= 2) {
          const candidatePo = tokens[tokens.length - 1];
          const candidateSite = tokens.slice(0, tokens.length - 1).join(" ").trim();
          if (looksLikePoNumber(candidatePo)) {
            poNumber = candidatePo;
            siteAddress = candidateSite;
          } else {
            siteAddress = line;
          }
        } else {
          siteAddress = line;
        }
      }
    } else if (valueLines.length >= 2) {
      let poLineIdx = -1;
      for (let i = valueLines.length - 1; i >= 0; i--) {
        if (looksLikePoNumber(valueLines[i])) {
          poNumber = valueLines[i].trim();
          poLineIdx = i;
          break;
        }
      }
      if (poLineIdx >= 0) {
        siteAddress = valueLines.filter((_, i) => i !== poLineIdx).join(" ").trim();
      } else {
        const last = valueLines[valueLines.length - 1].trim();
        const tokens = last.split(/\s+/).filter(Boolean);
        if (tokens.length >= 2) {
          const candidatePo = tokens[tokens.length - 1];
          if (looksLikePoNumber(candidatePo)) {
            poNumber = candidatePo;
            const head = tokens.slice(0, -1).join(" ");
            siteAddress = [...valueLines.slice(0, -1), head].join(" ").trim();
          } else {
            siteAddress = valueLines.join(" ").trim();
          }
        } else {
          siteAddress = valueLines.join(" ").trim();
        }
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

  // Last resort: under "P.O. NUMBER" header, pick the best PO-shaped token (never pure site words).
  if (!poNumber) {
    const linesRaw = text.split("\n").map((l) => l.trim());
    const headerIdx = linesRaw.findIndex((l) => /P\.?\s*O\.?\s*NUMBER/i.test(l));
    if (headerIdx >= 0) {
      const window = linesRaw.slice(headerIdx, headerIdx + 6).filter(Boolean);
      const candidates: string[] = [];
      for (const l of window) {
        const tokens = l
          .replace(/^Site\s+/i, "")
          .replace(/P\.?\s*O\.?\s*NUMBER/i, "")
          .split(/\s+/)
          .map((t) => t.trim())
          .filter(Boolean);
        if (tokens.length) {
          candidates.push(tokens[tokens.length - 1], ...tokens);
        }
      }
      const plausible = [...new Set(candidates)].filter(looksLikePoNumber);
      plausible.sort((a, b) => poMatchStrength(b) - poMatchStrength(a));
      if (plausible.length) {
        poNumber = plausible[0];
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
