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
  options?: { last?: boolean }
): Record<string, string | number> {
  return {
    width,
    marginRight: options?.last ? 0 : COL_GAP,
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
      <View style={cellBox(COL.date)}>
        <Text wrap>{formatInvoiceDate(r.issueDate)}</Text>
      </View>
      <View style={cellBox(COL.inv)}>
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
        <View style={cellBox(COL.date)}>
          <Text style={styles.tableHeadCellText}>Date</Text>
        </View>
        <View style={cellBox(COL.inv)}>
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

export function StatementPdfDocument(props: {
  company: CompanyHeader;
  customerName: string;
  customerAddress: string;
  statementDate: Date;
  rows: StatementRow[];
}) {
  const ROWS_PER_PAGE = 18;
  const { company, customerName, customerAddress, statementDate, rows } = props;
  const pages: StatementRow[][] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) {
    pages.push(rows.slice(i, i + ROWS_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]);

  const totals = computeStatementTotals(statementDate, rows);

  return (
    <Document>
      {pages.map((pageRows, pi) => (
        <Page key={pi} size="A4" style={styles.page}>
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
