import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";
import { formatInvoiceDate } from "@/lib/format/dates";
import { formatPounds } from "@/lib/format/money";
import {
  computeStatementTotals,
  daysOverdue,
  formatOverdueDaysLabel,
} from "@/lib/statements/statement-math";

/**
 * Sage Accounting Cloud–style customer statement: tabular columns and
 * right-aligned summary totals (native report look).
 */
const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 36,
    paddingHorizontal: 32,
    fontSize: 8,
    fontFamily: "Helvetica",
    color: "#222",
  },
  pageNumber: {
    position: "absolute",
    right: 32,
    bottom: 14,
    fontSize: 7.5,
    color: "#666",
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
    color: "#000",
  },
  statementDateLine: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 4,
    marginBottom: 6,
    color: "#111",
  },
  topHeaderRow: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-between",
    marginBottom: 6,
    alignItems: "flex-start",
  },
  topHeaderLeft: {
    width: "52%",
    paddingRight: 8,
  },
  topHeaderRight: {
    width: "48%",
    alignItems: "flex-end",
  },
  headerLogo: {
    width: 120,
    marginBottom: 8,
  },
  statementToBlock: {
    marginTop: 2,
  },
  headerCo: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  headerSmall: { fontSize: 7.5, marginBottom: 1.5, color: "#444", lineHeight: 1.35 },
  /** Company block (right column): larger than customer address for readability */
  headerRightAddress: {
    fontSize: 9.5,
    marginBottom: 2,
    color: "#333",
    lineHeight: 1.4,
  },
  /** Continuation pages: company block only, no logo — slightly larger for readability */
  continuationHeaderRow: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "flex-end",
    marginBottom: 6,
    alignItems: "flex-start",
  },
  continuationHeaderName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
    color: "#000",
  },
  continuationHeaderAddressLine: {
    fontSize: 10,
    marginBottom: 2,
    color: "#333",
    lineHeight: 1.4,
  },
  continuationHeaderReg: {
    fontSize: 8,
    marginTop: 2,
    color: "#444",
    lineHeight: 1.35,
  },
  /** Customer block (left column under statement date) */
  headerStatementToTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    color: "#000",
  },
  headerLeftCustomerName: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
    color: "#222",
    lineHeight: 1.4,
  },
  headerLeftAddressLine: {
    fontSize: 9.5,
    marginBottom: 2,
    color: "#333",
    lineHeight: 1.4,
  },
  hr: { borderBottomWidth: 1, borderBottomColor: "#333", marginVertical: 6 },
  tableHead: {
    flexDirection: "row",
    backgroundColor: "#f0f0f0",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#bbb",
    paddingVertical: 5,
    paddingHorizontal: 4,
    alignItems: "flex-start",
  },
  tableHeadCellText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: "#000",
  },
  dataRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e0e0e0",
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 8,
    alignItems: "flex-start",
    width: "100%",
  },
  colDaysOverdue: { color: "#c40000" },
  money: { fontFamily: "Helvetica" },
  addressRow: {
    flexDirection: "row",
    width: "100%",
    marginBottom: 8,
    justifyContent: "space-between",
  },
  addressColLeft: { width: "48%", paddingRight: 6 },
  addressColRight: { width: "48%", paddingLeft: 6, alignItems: "flex-end" },
  textRight: { textAlign: "right" },
  summaryWrap: {
    marginTop: 14,
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-between",
  },
  agingColumn: {
    width: "48%",
    paddingRight: 4,
  },
  summaryColumn: {
    width: "48%",
    paddingLeft: 4,
    alignItems: "flex-end",
  },
  summaryBox: {
    width: "100%",
    maxWidth: 260,
    alignItems: "flex-end",
  },
  summaryTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#000",
    marginBottom: 4,
    width: "100%",
    textAlign: "right",
    borderBottomWidth: 1,
    borderBottomColor: "#999",
    paddingBottom: 3,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    width: "100%",
    marginBottom: 3,
    paddingRight: 2,
  },
  summaryLabel: {
    fontSize: 7.5,
    color: "#333",
    width: "58%",
    textAlign: "right",
    paddingRight: 8,
  },
  summaryValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#000",
    width: "42%",
    textAlign: "right",
  },
  agingTable: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#aaa",
  },
  agingHead: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    backgroundColor: "#eaeaea",
    padding: 4,
    textAlign: "left",
    borderBottomWidth: 1,
    borderBottomColor: "#aaa",
  },
  agingRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
    paddingVertical: 3,
    paddingHorizontal: 5,
    fontSize: 7.5,
  },
  agingLabel: { width: "62%", color: "#444" },
  agingVal: { width: "38%", textAlign: "right", fontFamily: "Helvetica" },
});

/**
 * Fixed widths (pt) inside the padded A4 body — percentage flex rows in react-pdf
 * often overlap; explicit widths + gaps keep PO / site / invoice columns readable.
 */
const COL_GAP = 4;
/** Extra whitespace between Date and Invoice number (matches screenshot). */
const DATE_INV_GAP = 18;
/** Visual breathing room inside the Invoice number column. */
const INV_CELL_PADDING_LEFT = 6;
const COL = {
  date: 40,
  inv: 68,
  po: 58,
  site: 96,
  due: 38,
  od: 42,
  amt: 48,
  paid: 44,
  bal: 48,
} as const;

function cellBox(
  width: number,
  options?: { last?: boolean; gapRight?: number }
): Record<string, string | number> {
  return {
    width,
    marginRight: options?.last ? 0 : (options?.gapRight ?? COL_GAP),
    flexShrink: 0,
    flexGrow: 0,
  };
}

export type StatementRow = {
  issueDate: Date;
  invoiceNumber: string;
  poNumber: string;
  siteAddress: string;
  dueDate: Date;
  amountGross: number;
  paidGross: number;
  balanceGross: number;
};

export type CompanyHeader = {
  legalName: string;
  registeredAddress: string;
  companyRegistrationNumber: string;
  vatNumber: string;
  logoPath?: string;
};

function DataRow(props: { r: StatementRow; statementDate: Date }) {
  const { r, statementDate } = props;
  const od = daysOverdue(statementDate, r.dueDate);
  const invDisplay = String(r.invoiceNumber ?? "").trim() || "—";
  return (
    <View style={styles.dataRow} wrap={false}>
      <View style={cellBox(COL.date, { gapRight: DATE_INV_GAP })}>
        <Text wrap>{formatInvoiceDate(r.issueDate)}</Text>
      </View>
      <View style={[cellBox(COL.inv), { paddingLeft: INV_CELL_PADDING_LEFT }]}>
        <Text wrap>{invDisplay}</Text>
      </View>
      <View style={cellBox(COL.po)}>
        <Text wrap>{r.poNumber || ""}</Text>
      </View>
      <View style={cellBox(COL.site)}>
        <Text wrap>{r.siteAddress || "—"}</Text>
      </View>
      <View style={cellBox(COL.due)}>
        <Text wrap>{formatInvoiceDate(r.dueDate)}</Text>
      </View>
      <View style={cellBox(COL.od)}>
        <Text
          wrap
          style={
            od != null
              ? [{ textAlign: "center", width: "100%" }, styles.colDaysOverdue]
              : { textAlign: "center", width: "100%" }
          }
        >
          {formatOverdueDaysLabel(od)}
        </Text>
      </View>
      <View style={cellBox(COL.amt)}>
        <Text style={[styles.money, { textAlign: "right", width: "100%" }]} wrap>
          {formatPounds(r.amountGross)}
        </Text>
      </View>
      <View style={cellBox(COL.paid)}>
        <Text style={[styles.money, { textAlign: "right", width: "100%" }]} wrap>
          {r.paidGross > 0 ? formatPounds(r.paidGross) : ""}
        </Text>
      </View>
      <View style={cellBox(COL.bal, { last: true })}>
        <Text style={[styles.money, { textAlign: "right", width: "100%" }]} wrap>
          {formatPounds(r.balanceGross)}
        </Text>
      </View>
    </View>
  );
}

function CompanyStatementHeaderRight(props: {
  company: CompanyHeader;
  /** Page 1: show logo above company name when path is set */
  showLogo: boolean;
  /** Page 2+: larger type, no logo */
  variant: "firstPage" | "continuation";
}) {
  const { company, showLogo, variant } = props;
  const isCont = variant === "continuation";
  const nameStyle = isCont
    ? [styles.continuationHeaderName, styles.textRight]
    : [styles.headerCo, styles.textRight];
  const lineStyle = isCont
    ? [styles.continuationHeaderAddressLine, styles.textRight]
    : [styles.headerRightAddress, styles.textRight];
  const regStyle = isCont
    ? [styles.continuationHeaderReg, styles.textRight]
    : [styles.headerRightAddress, styles.textRight];

  return (
    <View style={styles.topHeaderRight}>
      {showLogo && company.logoPath ? (
        <Image src={company.logoPath} style={styles.headerLogo} />
      ) : null}
      <Text style={nameStyle}>{company.legalName || "Company"}</Text>
      {company.registeredAddress.split("\n").map((line, i) => (
        <Text key={i} style={lineStyle}>
          {line}
        </Text>
      ))}
      <Text style={regStyle}>
        Company No. {company.companyRegistrationNumber || "—"} · VAT No.{" "}
        {company.vatNumber || "—"}
      </Text>
    </View>
  );
}

function PageHeader(props: {
  company: CompanyHeader;
  customerName: string;
  customerAddress: string;
  statementDate: Date;
  showTitle: boolean;
}) {
  const { company, customerName, customerAddress, statementDate, showTitle } = props;
  return (
    <>
      {showTitle ? (
        <>
          <View style={styles.topHeaderRow}>
            <View style={styles.topHeaderLeft}>
              <Text style={styles.title}>Customer statement</Text>
              <Text style={styles.statementDateLine}>
                Statement date {formatInvoiceDate(statementDate)}
              </Text>
              <View style={styles.statementToBlock}>
                <Text style={styles.headerStatementToTitle}>Statement to</Text>
                <Text style={styles.headerLeftCustomerName}>{customerName}</Text>
                {customerAddress.split("\n").map((line, i) => (
                  <Text key={i} style={styles.headerLeftAddressLine}>
                    {line}
                  </Text>
                ))}
              </View>
            </View>
            <CompanyStatementHeaderRight
              company={company}
              showLogo
              variant="firstPage"
            />
          </View>
          <View style={styles.hr} />
        </>
      ) : (
        <>
          <View style={styles.topHeaderRow}>
            <View style={styles.topHeaderLeft}>
              <Text style={styles.title}>Customer statement</Text>
              <Text style={styles.statementDateLine}>
                Statement date {formatInvoiceDate(statementDate)}
              </Text>
              <View style={styles.statementToBlock}>
                <Text style={styles.headerStatementToTitle}>Statement to</Text>
                <Text style={styles.headerLeftCustomerName}>{customerName}</Text>
              </View>
            </View>
            <CompanyStatementHeaderRight
              company={company}
              showLogo={false}
              variant="continuation"
            />
          </View>
          <View style={styles.hr} />
        </>
      )}
      <View style={styles.tableHead}>
        <View style={cellBox(COL.date, { gapRight: DATE_INV_GAP })}>
          <Text style={styles.tableHeadCellText}>Date</Text>
        </View>
        <View style={[cellBox(COL.inv), { paddingLeft: INV_CELL_PADDING_LEFT }]}>
          <Text style={styles.tableHeadCellText}>Invoice number</Text>
        </View>
        <View style={cellBox(COL.po)}>
          <Text style={styles.tableHeadCellText}>PO number</Text>
        </View>
        <View style={cellBox(COL.site)}>
          <Text style={styles.tableHeadCellText}>Site address</Text>
        </View>
        <View style={cellBox(COL.due)}>
          <Text style={styles.tableHeadCellText}>Due date</Text>
        </View>
        <View style={cellBox(COL.od)}>
          <Text style={[styles.tableHeadCellText, { textAlign: "center", width: "100%" }]}>
            Overdue days
          </Text>
        </View>
        <View style={cellBox(COL.amt)}>
          <Text style={[styles.tableHeadCellText, { textAlign: "right", width: "100%" }]}>
            Amount
          </Text>
        </View>
        <View style={cellBox(COL.paid)}>
          <Text style={[styles.tableHeadCellText, { textAlign: "right", width: "100%" }]}>
            Paid
          </Text>
        </View>
        <View style={cellBox(COL.bal, { last: true })}>
          <Text style={[styles.tableHeadCellText, { textAlign: "right", width: "100%" }]}>
            Balance
          </Text>
        </View>
      </View>
    </>
  );
}

function SummaryFooter(props: {
  totals: ReturnType<typeof computeStatementTotals>;
}) {
  const { totals } = props;
  return (
    <View style={styles.summaryWrap}>
      <View style={styles.agingColumn}>
        <View style={styles.agingTable}>
          <Text style={styles.agingHead}>How long have I owed this money?</Text>
          <View style={styles.agingRow}>
            <Text style={styles.agingLabel}>1–30 days</Text>
            <Text style={styles.agingVal}>{formatPounds(totals.aging.b30)}</Text>
          </View>
          <View style={styles.agingRow}>
            <Text style={styles.agingLabel}>31–60 days</Text>
            <Text style={styles.agingVal}>{formatPounds(totals.aging.b60)}</Text>
          </View>
          <View style={styles.agingRow}>
            <Text style={styles.agingLabel}>61–90 days</Text>
            <Text style={styles.agingVal}>{formatPounds(totals.aging.b90)}</Text>
          </View>
          <View style={styles.agingRow}>
            <Text style={styles.agingLabel}>91–120 days</Text>
            <Text style={styles.agingVal}>{formatPounds(totals.aging.b120)}</Text>
          </View>
          <View style={styles.agingRow}>
            <Text style={styles.agingLabel}>121+ days</Text>
            <Text style={styles.agingVal}>{formatPounds(totals.aging.b121)}</Text>
          </View>
        </View>
      </View>
      <View style={styles.summaryColumn}>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total owed</Text>
            <Text style={styles.summaryValue}>{formatPounds(totals.totalDue)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total overdue</Text>
            <Text style={styles.summaryValue}>{formatPounds(totals.totalOverdue)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * Effective average glyph width for Helvetica 8pt (pt) in invoice table cells.
 * Slightly optimistic vs measured textkit widths so we don’t treat every row as
 * multi-line — that was starving pages (huge blank areas) while greedy pagination
 * thought the page was “full”.
 */
const HELV_8_AVG_CHAR_PT = 4.05;

function charsPerLineForColWidth(colWidthPt: number): number {
  return Math.max(8, Math.round(colWidthPt / HELV_8_AVG_CHAR_PT));
}

/** Lines for one paragraph segment (word wrap + unbreakable long tokens). */
function lineCountForSegment(seg: string, cpl: number): number {
  const s = seg.replace(/[ \t\f\v]+/g, " ").trim();
  if (!s) return 0;
  let lines = 1;
  let cur = 0;
  for (const word of s.split(/\s+/)) {
    if (!word) continue;
    if (word.length > cpl) {
      if (cur > 0) {
        lines++;
        cur = 0;
      }
      lines += Math.ceil(word.length / cpl) - 1;
      cur = word.length % cpl === 0 ? 0 : word.length % cpl;
      continue;
    }
    const next = cur === 0 ? word.length : cur + 1 + word.length;
    if (next <= cpl) cur = next;
    else {
      lines++;
      cur = word.length;
    }
  }
  return lines;
}

/** Wrapped lines for a table cell matching `COL.*` width (handles explicit newlines). */
function columnTextLines(text: string, colWidthPt: number): number {
  const raw = (text ?? "").trim();
  if (!raw) return 1;
  const cpl = charsPerLineForColWidth(colWidthPt);
  let lines = 0;
  for (const part of raw.split(/\r?\n/)) {
    const n = lineCountForSegment(part, cpl);
    lines += n === 0 ? 1 : n;
  }
  return Math.max(1, lines);
}

function estimateFirstPageHeaderTablePt(
  company: CompanyHeader,
  customerAddress: string
): number {
  const custLines = Math.max(
    customerAddress.split("\n").filter((l) => l.trim()).length,
    1
  );
  const companyAddrLines = Math.max(
    company.registeredAddress.split("\n").filter((l) => l.trim()).length,
    1
  );
  const logoExtra = company.logoPath ? 96 : 0;
  const leftCol = 68 + Math.min(custLines, 12) * 11;
  const rightCol =
    logoExtra + 10 + Math.min(companyAddrLines, 14) * 11 + 20;
  const headerRow = Math.max(leftCol, rightCol);
  const hr = 12;
  const table = 34;
  return Math.min(340, headerRow + hr + table + 4);
}

function estimateContHeaderTablePt(company: CompanyHeader): number {
  const companyAddrLines = Math.max(
    company.registeredAddress.split("\n").filter((l) => l.trim()).length,
    1
  );
  const leftCol = 68;
  const rightCol = 12 + Math.min(companyAddrLines, 14) * 11 + 20;
  const headerRow = Math.max(leftCol, rightCol);
  const hr = 12;
  const table = 34;
  return Math.min(245, headerRow + hr + table + 4);
}

/**
 * Split detail rows across A4 pages using an approximate **vertical budget** (pt), not a
 * fixed row count. After allocations, some rows disappear and others stay short — this
 * pulls as many rows as fit onto each sheet before starting the next, so spare space on
 * page 2 is filled from page 3, etc., without huge arbitrary gaps.
 *
 * Row heights use **word-wrap** line counts per column (site / invoice / PO), not
 * `ceil(totalChars / cpl)`, which massively over-counts lines vs real PDF layout and was
 * leaving most of each page empty. Header reserves follow the header layout (max of
 * left/right columns). A follow-up pass pulls rows forward when they still fit.
 */
function paginateStatementRows(
  all: StatementRow[],
  company: CompanyHeader,
  customerAddress: string
): StatementRow[][] {
  /** A4 height minus `styles.page` padding (top 28 + bottom 36). */
  const PAGE_BODY_PT = 842 - 28 - 36;
  const FIRST_PAGE_HEADER_TABLE_PT = estimateFirstPageHeaderTablePt(
    company,
    customerAddress
  );
  const CONT_PAGE_HEADER_TABLE_PT = estimateContHeaderTablePt(company);
  /** Aging + summary block on the final page only. */
  const SUMMARY_BLOCK_PT = 96;
  /** Minimum row band (borders, padding, one text line) — aligned with `styles.dataRow`. */
  const ROW_BASE_PT = 17;
  const ROW_EXTRA_LINE_PT = 7;
  /** Safety cap — rare mega-cells still render but won’t reserve a whole page each. */
  const MAX_TEXT_LINES_PER_ROW = 12;
  /**
   * Layout (Yoga) packs text slightly tighter than our analytic model. Nudging row
   * heights down brings pagination in line with the real PDF so pages fill before
   * breaking. If rows clip, raise toward 1.
   */
  const ROW_HEIGHT_PACK_FACTOR = 0.9;

  function estimatedRowHeightPt(r: StatementRow): number {
    const invDisplay = String(r.invoiceNumber ?? "").trim() || "—";
    const po = String(r.poNumber ?? "").trim();
    const site = String(r.siteAddress ?? "").trim() || "—";
    const lines = Math.min(
      MAX_TEXT_LINES_PER_ROW,
      Math.max(
        columnTextLines(invDisplay, COL.inv),
        columnTextLines(po, COL.po),
        columnTextLines(site, COL.site)
      )
    );
    const raw = ROW_BASE_PT + (lines - 1) * ROW_EXTRA_LINE_PT;
    const scaled =
      ROW_BASE_PT + (raw - ROW_BASE_PT) * ROW_HEIGHT_PACK_FACTOR;
    return Math.max(ROW_BASE_PT * 0.92, scaled);
  }

  function heightForSlice(
    start: number,
    endExclusive: number,
    pageIndex: number
  ): number {
    const headerPt =
      pageIndex === 0
        ? FIRST_PAGE_HEADER_TABLE_PT
        : CONT_PAGE_HEADER_TABLE_PT;
    let h = headerPt;
    for (let j = start; j < endExclusive; j++) {
      h += estimatedRowHeightPt(all[j]);
    }
    if (endExclusive === all.length) {
      h += SUMMARY_BLOCK_PT;
    }
    return h;
  }

  /**
   * Pull rows onto earlier pages while the model says they fit. Run forward passes
   * until stable so a chain of moves (page 3 → 2 → 1) fully packs.
   */
  function tightenBreaks(breaks: number[]): number[] {
    const b = [...breaks];
    const budgetEps = 1.5;
    let moved = true;
    while (moved) {
      moved = false;
      for (let pi = 0; pi < b.length - 2; pi++) {
        const start = b[pi];
        const mid = b[pi + 1];
        const endNext = b[pi + 2];
        if (mid >= endNext) continue;
        const newMid = mid + 1;
        if (heightForSlice(start, newMid, pi) <= PAGE_BODY_PT - budgetEps) {
          b[pi + 1] = newMid;
          moved = true;
        }
      }
      for (let i = 0; i < b.length - 1; i++) {
        if (b[i] === b[i + 1]) {
          b.splice(i + 1, 1);
          moved = true;
          break;
        }
      }
    }
    return b;
  }

  if (all.length === 0) return [[]];

  const breaks: number[] = [0];
  let idx = 0;
  let pageIndex = 0;

  while (idx < all.length) {
    const headerPt =
      pageIndex === 0 ? FIRST_PAGE_HEADER_TABLE_PT : CONT_PAGE_HEADER_TABLE_PT;
    let budget = PAGE_BODY_PT - headerPt;
    const pageStart = idx;

    while (idx < all.length) {
      const r = all[idx];
      const rowPt = estimatedRowHeightPt(r);
      const isLastDocumentRow = idx + 1 === all.length;
      const footerPt = isLastDocumentRow ? SUMMARY_BLOCK_PT : 0;

      if (idx > pageStart && budget < rowPt + footerPt) {
        break;
      }
      if (idx === pageStart && budget < rowPt + footerPt) {
        idx += 1;
        break;
      }
      budget -= rowPt;
      idx += 1;
    }

    breaks.push(idx);
    pageIndex += 1;
  }

  const finalBreaks = tightenBreaks(breaks);
  const pages: StatementRow[][] = [];
  for (let i = 0; i < finalBreaks.length - 1; i++) {
    pages.push(all.slice(finalBreaks[i], finalBreaks[i + 1]));
  }
  return pages;
}

export function StatementPdfDocument(props: {
  company: CompanyHeader;
  customerName: string;
  customerAddress: string;
  statementDate: Date;
  rows: StatementRow[];
}) {
  const { company, customerName, customerAddress, statementDate, rows } = props;
  const pages = paginateStatementRows(rows, company, customerAddress);

  const totals = computeStatementTotals(statementDate, rows);

  return (
    <Document>
      {pages.map((pageRows, pi) => (
        <Page key={pi} size="A4" style={styles.page} wrap={false}>
          <Text
            style={styles.pageNumber}
            fixed
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
          <PageHeader
            company={company}
            customerName={customerName}
            customerAddress={customerAddress}
            statementDate={statementDate}
            showTitle={pi === 0}
          />
          {pageRows.map((r, idx) => (
            <DataRow key={idx} r={r} statementDate={statementDate} />
          ))}
          {pi === pages.length - 1 ? <SummaryFooter totals={totals} /> : null}
        </Page>
      ))}
    </Document>
  );
}
