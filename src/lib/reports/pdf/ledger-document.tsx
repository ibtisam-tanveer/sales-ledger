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
});

export function LedgerPdfDocument(props: {
  customerName: string;
  from?: string;
  to?: string;
  openingGross?: number;
  lines: LedgerLineWithRunning[];
}) {
  const { customerName, from, to, openingGross, lines } = props;
  const range = `Date range: ${from?.length ? formatUiDate(from) : "…"} to ${to?.length ? formatUiDate(to) : "…"}`;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Customer activity (ledger)</Text>
        <Text style={styles.meta}>
          {customerName}
          {"\n"}
          {range}
          {from && openingGross !== undefined
            ? `\nOpening balance (before range): ${formatPounds(openingGross)}`
            : ""}
        </Text>

        <View style={styles.tableHead}>
          <Text style={styles.colDate}>Date</Text>
          <Text style={styles.colType}>Type</Text>
          <Text style={styles.colRef}>Ref</Text>
          <Text style={styles.colNet}>Net</Text>
          <Text style={styles.colVat}>VAT</Text>
          <Text style={styles.colGross}>Gross/Pay</Text>
          <Text style={styles.colRun}>Running</Text>
        </View>

        {lines.map((l, i) => (
          <View key={i} style={styles.row} wrap={false}>
            <Text style={styles.colDate}>
              {l.kind === "invoice" ? formatInvoiceDate(l.date) : formatUiDate(l.date)}
            </Text>
            <Text style={styles.colType}>{l.kind}</Text>
            <Text style={styles.colRef}>{l.ref}</Text>
            <Text style={styles.colNet}>
              {l.kind === "invoice" ? formatPounds(l.net) : ""}
            </Text>
            <Text style={styles.colVat}>
              {l.kind === "invoice" ? formatPounds(l.vat) : ""}
            </Text>
            <Text style={styles.colGross}>
              {l.kind === "invoice"
                ? formatPounds(l.gross)
                : formatPounds(-l.amount)}
            </Text>
            <Text style={styles.colRun}>{formatPounds(l.runningGross)}</Text>
          </View>
        ))}

        <Text style={{ marginTop: 10, fontSize: 8, color: "#666" }}>
          Generated {formatUiDateTime(new Date())}
        </Text>
      </Page>
    </Document>
  );
}

