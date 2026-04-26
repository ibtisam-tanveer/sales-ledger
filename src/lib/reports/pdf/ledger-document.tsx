import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatInvoiceDate, formatUiDate, formatUiDateTime } from "@/lib/format/dates";
import { formatPounds } from "@/lib/format/money";
import type { LedgerLineWithRunning } from "@/lib/reports/ledger-compute";

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 36,
    paddingHorizontal: 32,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#222",
  },
  pageNumber: {
    position: "absolute",
    right: 32,
    bottom: 14,
    fontSize: 8,
    color: "#666",
  },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  meta: { fontSize: 9, color: "#555", marginBottom: 10, lineHeight: 1.3 },
  tableHead: {
    flexDirection: "row",
    backgroundColor: "#f0f0f0",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#bbb",
    paddingVertical: 6,
    paddingHorizontal: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e0e0e0",
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontSize: 9,
  },
  colDate: { width: "14%" },
  colType: { width: "12%" },
  colRef: { width: "24%" },
  colNet: { width: "12%", textAlign: "right" },
  colVat: { width: "12%", textAlign: "right" },
  colGross: { width: "13%", textAlign: "right" },
  colRun: { width: "13%", textAlign: "right" },
  contLabel: { fontSize: 8, color: "#666", marginBottom: 6 },
});

function LedgerTableHead() {
  return (
    <View style={styles.tableHead}>
      <Text style={styles.colDate}>Date</Text>
      <Text style={styles.colType}>Type</Text>
      <Text style={styles.colRef}>Ref</Text>
      <Text style={styles.colNet}>Net</Text>
      <Text style={styles.colVat}>VAT</Text>
      <Text style={styles.colGross}>Gross/Pay</Text>
      <Text style={styles.colRun}>Running</Text>
    </View>
  );
}

function LedgerDataRow(props: { l: LedgerLineWithRunning }) {
  const { l } = props;
  return (
    <View style={styles.row} wrap={false}>
      <Text style={styles.colDate}>
        {l.kind === "invoice" ? formatInvoiceDate(l.date) : formatUiDate(l.date)}
      </Text>
      <Text style={styles.colType}>{l.kind}</Text>
      <Text style={styles.colRef} wrap>
        {l.ref}
      </Text>
      <Text style={styles.colNet}>
        {l.kind === "invoice" ? formatPounds(l.net) : ""}
      </Text>
      <Text style={styles.colVat}>
        {l.kind === "invoice" ? formatPounds(l.vat) : ""}
      </Text>
      <Text style={styles.colGross}>
        {l.kind === "invoice" ? formatPounds(l.gross) : formatPounds(-l.amount)}
      </Text>
      <Text style={styles.colRun}>{formatPounds(l.runningGross)}</Text>
    </View>
  );
}

/**
 * Pack ledger rows using a pt budget (same idea as customer statements) so each page
 * is filled before starting the next, instead of relying on a single Page + engine breaks.
 */
function paginateLedgerLines(all: LedgerLineWithRunning[]): LedgerLineWithRunning[][] {
  const PAGE_BODY_PT = 842 - 28 - 36;
  /** Title + meta + table head. */
  const FIRST_PAGE_HEADER_PT = 152;
  /** Continuation label + table head. */
  const CONT_PAGE_HEADER_PT = 52;
  /** “Generated …” on the last page only. */
  const FOOTER_PT = 22;
  const ROW_BASE_PT = 20;
  /** Ref column ~24% of padded body width @ 9pt. */
  const REF_CHARS_PER_LINE = 24;
  const REF_EXTRA_LINE_PT = 9;

  function estimatedRowHeightPt(l: LedgerLineWithRunning): number {
    const ref = String(l.ref ?? "");
    const lines = ref ? Math.max(1, Math.ceil(ref.length / REF_CHARS_PER_LINE)) : 1;
    return ROW_BASE_PT + (lines - 1) * REF_EXTRA_LINE_PT;
  }

  function heightForSlice(
    start: number,
    endExclusive: number,
    pageIndex: number
  ): number {
    const headerPt =
      pageIndex === 0 ? FIRST_PAGE_HEADER_PT : CONT_PAGE_HEADER_PT;
    let h = headerPt;
    for (let j = start; j < endExclusive; j++) {
      h += estimatedRowHeightPt(all[j]);
    }
    if (endExclusive === all.length) {
      h += FOOTER_PT;
    }
    return h;
  }

  function tightenBreaks(breaks: number[]): number[] {
    const b = [...breaks];
    let moved = true;
    while (moved) {
      moved = false;
      for (let pi = 0; pi < b.length - 2; pi++) {
        const start = b[pi];
        const mid = b[pi + 1];
        const endNext = b[pi + 2];
        if (mid >= endNext) continue;
        const newMid = mid + 1;
        if (heightForSlice(start, newMid, pi) <= PAGE_BODY_PT) {
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
      pageIndex === 0 ? FIRST_PAGE_HEADER_PT : CONT_PAGE_HEADER_PT;
    let budget = PAGE_BODY_PT - headerPt;
    const pageStart = idx;

    while (idx < all.length) {
      const rowPt = estimatedRowHeightPt(all[idx]);
      const isLast = idx + 1 === all.length;
      const tailPt = isLast ? FOOTER_PT : 0;

      if (idx > pageStart && budget < rowPt + tailPt) {
        break;
      }
      if (idx === pageStart && budget < rowPt + tailPt) {
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
  const pages: LedgerLineWithRunning[][] = [];
  for (let i = 0; i < finalBreaks.length - 1; i++) {
    pages.push(all.slice(finalBreaks[i], finalBreaks[i + 1]));
  }
  return pages;
}

export function LedgerPdfDocument(props: {
  customerName: string;
  from?: string;
  to?: string;
  openingGross?: number;
  lines: LedgerLineWithRunning[];
}) {
  const { customerName, from, to, openingGross, lines } = props;
  const range = `Date range: ${from?.length ? formatUiDate(from) : "…"} to ${to?.length ? formatUiDate(to) : "…"}`;
  const pages = paginateLedgerLines(lines);
  const genText = `Generated ${formatUiDateTime(new Date())}`;

  return (
    <Document>
      {pages.map((pageLines, pi) => (
        <Page key={pi} size="A4" style={styles.page}>
          <Text
            style={styles.pageNumber}
            fixed
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
          {pi === 0 ? (
            <>
              <Text style={styles.title}>Customer activity (ledger)</Text>
              <Text style={styles.meta}>
                {customerName}
                {"\n"}
                {range}
                {from && openingGross !== undefined
                  ? `\nOpening balance (before range): ${formatPounds(openingGross)}`
                  : ""}
              </Text>
            </>
          ) : (
            <Text style={styles.contLabel}>Customer activity (ledger) — continued</Text>
          )}
          <LedgerTableHead />
          {pageLines.map((l, i) => (
            <LedgerDataRow key={`${pi}-${i}`} l={l} />
          ))}
          {pi === pages.length - 1 ? (
            <Text style={{ marginTop: 10, fontSize: 8, color: "#666" }}>{genText}</Text>
          ) : null}
        </Page>
      ))}
    </Document>
  );
}

