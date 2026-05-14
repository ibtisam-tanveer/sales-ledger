import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatInvoiceDate, formatUiDateTime } from "@/lib/format/dates";
import { formatPounds } from "@/lib/format/money";
import type { InvoiceRegisterExportRow } from "./invoice-register-export-row";

const styles = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingBottom: 32,
    paddingHorizontal: 28,
    fontSize: 7,
    fontFamily: "Helvetica",
    color: "#222",
  },
  pageNumber: {
    position: "absolute",
    right: 28,
    bottom: 12,
    fontSize: 7,
    color: "#666",
  },
  title: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  meta: { fontSize: 8, color: "#555", marginBottom: 8, lineHeight: 1.3 },
  tableHead: {
    flexDirection: "row",
    backgroundColor: "#f0f0f0",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#bbb",
    paddingVertical: 5,
    paddingHorizontal: 3,
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e0e0e0",
    paddingVertical: 4,
    paddingHorizontal: 3,
    fontSize: 7,
  },
  colIssue: { width: "9%" },
  colPosted: { width: "9%" },
  colInv: { width: "10%" },
  colCust: { width: "18%" },
  colSite: { width: "20%" },
  colStat: { width: "10%" },
  colNet: { width: "8%", textAlign: "right" },
  colVat: { width: "8%", textAlign: "right" },
  colGross: { width: "8%", textAlign: "right" },
  totalsRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#999",
    paddingTop: 6,
    marginTop: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
});

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function InvoiceRegisterPdfDocument(props: {
  rows: InvoiceRegisterExportRow[];
  totals: { net: number; vat: number; gross: number };
}) {
  const { rows, totals } = props;
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text
          style={styles.pageNumber}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
        />
        <Text style={styles.title}>Sales invoice register</Text>
        <Text style={styles.meta}>
          {rows.length} invoice{rows.length === 1 ? "" : "s"} · Generated{" "}
          {formatUiDateTime(new Date())}
        </Text>

        <View style={styles.tableHead}>
          <Text style={styles.colIssue}>Issue</Text>
          <Text style={styles.colPosted}>Posted</Text>
          <Text style={styles.colInv}>Inv no.</Text>
          <Text style={styles.colCust}>Customer</Text>
          <Text style={styles.colSite}>Site</Text>
          <Text style={styles.colStat}>Status</Text>
          <Text style={styles.colNet}>Net</Text>
          <Text style={styles.colVat}>VAT</Text>
          <Text style={styles.colGross}>Gross</Text>
        </View>

        {rows.map((row) => (
          <View key={row._id} style={styles.row} wrap>
            <Text style={styles.colIssue}>{formatInvoiceDate(row.issueDate)}</Text>
            <Text style={styles.colPosted}>
              {row.postedAt ? formatInvoiceDate(row.postedAt) : "—"}
            </Text>
            <Text style={styles.colInv}>{row.invoiceNumber}</Text>
            <Text style={styles.colCust}>{clip(row.customerName || "—", 42)}</Text>
            <Text style={styles.colSite}>
              {clip(row.siteAddress?.trim() ? row.siteAddress : "—", 48)}
            </Text>
            <Text style={styles.colStat}>{statusLabel(row.status)}</Text>
            <Text style={styles.colNet}>{formatPounds(row.amountNet)}</Text>
            <Text style={styles.colVat}>{formatPounds(row.amountVat)}</Text>
            <Text style={styles.colGross}>{formatPounds(row.amountGross)}</Text>
          </View>
        ))}

        <View style={styles.totalsRow} wrap={false}>
          <Text style={{ width: "76%", textAlign: "right", paddingRight: 6 }}>Total</Text>
          <Text style={styles.colNet}>{formatPounds(totals.net)}</Text>
          <Text style={styles.colVat}>{formatPounds(totals.vat)}</Text>
          <Text style={styles.colGross}>{formatPounds(totals.gross)}</Text>
        </View>
      </Page>
    </Document>
  );
}
