import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatInvoiceDate, formatUiDate, formatUiDateTime } from "@/lib/format/dates";
import type { VatReportRow } from "@/lib/reports/vat-report";
import { formatPounds } from "@/lib/format/money";

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 36,
    paddingHorizontal: 32,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#222",
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
  colDate: { width: "16%" },
  colInv: { width: "24%" },
  colNet: { width: "20%", textAlign: "right" },
  colVat: { width: "20%", textAlign: "right" },
  colGross: { width: "20%", textAlign: "right" },
  totalsRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#999",
    paddingTop: 8,
    marginTop: 8,
  },
  totalsLabel: { width: "40%", textAlign: "right", paddingRight: 8, fontFamily: "Helvetica-Bold" },
  totalsVal: { width: "60%", textAlign: "right", fontFamily: "Helvetica-Bold" },
});

export function VatPdfDocument(props: {
  from?: string;
  to?: string;
  totalsOnly: boolean;
  rows: VatReportRow[];
  totals: { net: number; vat: number; gross: number };
}) {
  const { from, to, totalsOnly, rows, totals } = props;
  const range = `Date range: ${from?.length ? formatUiDate(from) : "…"} to ${to?.length ? formatUiDate(to) : "…"}`;
  const mode = totalsOnly ? "Totals only (summary)" : "Invoice detail";
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>VAT summary / return data</Text>
        <Text style={styles.meta}>
          {range}
          {"\n"}
          {mode}
        </Text>

        <View style={styles.tableHead}>
          <Text style={styles.colDate}>Date</Text>
          <Text style={styles.colInv}>Invoice</Text>
          <Text style={styles.colNet}>Net (£)</Text>
          <Text style={styles.colVat}>VAT (£)</Text>
          <Text style={styles.colGross}>Gross (£)</Text>
        </View>

        {!totalsOnly
          ? rows.map((r) => (
              <View key={r._id} style={styles.row} wrap={false}>
                <Text style={styles.colDate}>{formatInvoiceDate(r.issueDate)}</Text>
                <Text style={styles.colInv}>{r.invoiceNumber}</Text>
                <Text style={styles.colNet}>{formatPounds(r.amountNet)}</Text>
                <Text style={styles.colVat}>{formatPounds(r.amountVat)}</Text>
                <Text style={styles.colGross}>{formatPounds(r.amountGross)}</Text>
              </View>
            ))
          : null}

        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Total</Text>
          <Text style={styles.totalsVal}>
            Net {formatPounds(totals.net)} · VAT {formatPounds(totals.vat)} · Gross{" "}
            {formatPounds(totals.gross)}
          </Text>
        </View>
        <Text style={{ marginTop: 10, fontSize: 8, color: "#666" }}>
          Generated {formatUiDateTime(new Date())}
        </Text>
      </Page>
    </Document>
  );
}

