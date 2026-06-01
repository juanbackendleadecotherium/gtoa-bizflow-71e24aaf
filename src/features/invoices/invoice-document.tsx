import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

export type InvoiceBrandSnapshot = {
  name: string;
  legal_name?: string | null;
  tax_id?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  invoice_footer_note?: string | null;
};

export type InvoiceCustomerSnapshot = {
  name?: string | null;
  company?: string | null;
  doc_type?: string | null;
  doc_number?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  department?: string | null;
};

export type InvoiceItemSnapshot = {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type InvoiceDocumentData = {
  invoice_number: string;
  order_number: string;
  issued_at: string;
  sale_date?: string | null;
  payment_method?: string | null;
  notes?: string | null;
  brand: InvoiceBrandSnapshot;
  customer: InvoiceCustomerSnapshot;
  items: InvoiceItemSnapshot[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  advance: number;
  balance: number;
  terms_html?: string | null;
  terms_version?: number | null;
};

const fmtCOP = (n: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(n || 0));

const fmtDate = (s?: string | null) => {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("es-CO", {
      day: "2-digit", month: "long", year: "numeric",
    });
  } catch {
    return s;
  }
};

const baseColor = "#0f172a";

const styles = StyleSheet.create({
  page: {
    paddingTop: 36, paddingBottom: 56, paddingHorizontal: 36,
    fontSize: 9.5, color: "#0f172a", fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    borderBottomWidth: 2, paddingBottom: 12, marginBottom: 16,
  },
  brandBlock: { flexDirection: "row", gap: 12, alignItems: "center", maxWidth: "60%" },
  logo: { width: 52, height: 52, objectFit: "contain" },
  brandName: { fontSize: 14, fontWeight: 700 },
  muted: { color: "#64748b" },
  invoiceMeta: { textAlign: "right" },
  invoiceTitle: { fontSize: 11, letterSpacing: 1.5, color: "#64748b", marginBottom: 4 },
  invoiceNumber: { fontSize: 16, fontWeight: 700 },
  twoCol: { flexDirection: "row", gap: 12, marginBottom: 14 },
  panel: {
    flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 4,
    padding: 10,
  },
  panelTitle: {
    fontSize: 8, letterSpacing: 1.2, color: "#64748b", textTransform: "uppercase",
    marginBottom: 6,
  },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  tableHeader: {
    flexDirection: "row", backgroundColor: "#f1f5f9",
    paddingVertical: 6, paddingHorizontal: 6, marginTop: 4,
    borderTopLeftRadius: 3, borderTopRightRadius: 3,
  },
  tableHeaderText: { fontSize: 8, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 },
  tableRow: {
    flexDirection: "row", paddingVertical: 6, paddingHorizontal: 6,
    borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0",
  },
  colDesc: { flex: 5, paddingRight: 6 },
  colQty: { flex: 1, textAlign: "right" },
  colPrice: { flex: 2, textAlign: "right" },
  colTotal: { flex: 2, textAlign: "right" },
  totalsBox: {
    marginTop: 10, marginLeft: "auto", width: "50%",
    borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 4, padding: 10,
  },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  totalLine: {
    flexDirection: "row", justifyContent: "space-between",
    borderTopWidth: 1, borderTopColor: "#cbd5e1",
    marginTop: 4, paddingTop: 5,
  },
  badge: {
    marginTop: 4, padding: 6, borderRadius: 3,
    fontSize: 8.5,
  },
  termsHeader: { fontSize: 12, fontWeight: 700, marginBottom: 8, marginTop: 4 },
  termsPara: { marginBottom: 6, lineHeight: 1.4, textAlign: "justify" },
  footer: {
    position: "absolute", bottom: 24, left: 36, right: 36,
    flexDirection: "row", justifyContent: "space-between",
    borderTopWidth: 0.5, borderTopColor: "#cbd5e1", paddingTop: 6,
    fontSize: 7.5, color: "#94a3b8",
  },
});

export function InvoiceDocument({ data }: { data: InvoiceDocumentData }) {
  const accent = data.brand.primary_color || baseColor;
  const customerLines = [data.customer.address, data.customer.city, data.customer.department]
    .filter(Boolean).join(", ");
  const paidPct = data.total > 0 ? Math.round((data.advance / data.total) * 100) : 0;

  return (
    <Document title={`Factura ${data.invoice_number}`}>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: accent }]}>
          <View style={styles.brandBlock}>
            {data.brand.logo_url ? <Image src={data.brand.logo_url} style={styles.logo} /> : null}
            <View>
              <Text style={[styles.brandName, { color: accent }]}>{data.brand.name}</Text>
              {data.brand.legal_name ? <Text style={styles.muted}>{data.brand.legal_name}</Text> : null}
              {data.brand.tax_id ? <Text style={styles.muted}>NIT: {data.brand.tax_id}</Text> : null}
              {data.brand.address ? <Text style={styles.muted}>{data.brand.address}{data.brand.city ? `, ${data.brand.city}` : ""}</Text> : null}
              {data.brand.phone ? <Text style={styles.muted}>Tel: {data.brand.phone}</Text> : null}
              {data.brand.email ? <Text style={styles.muted}>{data.brand.email}</Text> : null}
            </View>
          </View>
          <View style={styles.invoiceMeta}>
            <Text style={styles.invoiceTitle}>FACTURA DE VENTA</Text>
            <Text style={[styles.invoiceNumber, { color: accent }]}>{data.invoice_number}</Text>
            <Text style={styles.muted}>Orden: {data.order_number}</Text>
            <Text style={styles.muted}>Emitida: {fmtDate(data.issued_at)}</Text>
            {data.sale_date ? <Text style={styles.muted}>Fecha venta: {fmtDate(data.sale_date)}</Text> : null}
          </View>
        </View>

        {/* Client + payment */}
        <View style={styles.twoCol}>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Cliente</Text>
            <Text style={{ fontWeight: 700 }}>{data.customer.name || "—"}</Text>
            {data.customer.company ? <Text style={styles.muted}>{data.customer.company}</Text> : null}
            {data.customer.doc_number ? (
              <Text style={styles.muted}>{data.customer.doc_type ? `${data.customer.doc_type} ` : ""}{data.customer.doc_number}</Text>
            ) : null}
            {data.customer.phone ? <Text style={styles.muted}>Tel: {data.customer.phone}</Text> : null}
            {data.customer.email ? <Text style={styles.muted}>{data.customer.email}</Text> : null}
            {customerLines ? <Text style={styles.muted}>{customerLines}</Text> : null}
          </View>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Información de pago</Text>
            <View style={styles.row}><Text style={styles.muted}>Método</Text><Text>{data.payment_method || "—"}</Text></View>
            <View style={styles.row}><Text style={styles.muted}>Abono recibido</Text><Text>{fmtCOP(data.advance)}</Text></View>
            <View style={styles.row}><Text style={styles.muted}>Saldo pendiente</Text><Text style={{ fontWeight: 700 }}>{fmtCOP(data.balance)}</Text></View>
            <View style={[styles.row, { marginTop: 4 }]}>
              <Text style={styles.muted}>Pagado</Text>
              <Text style={{ color: accent, fontWeight: 700 }}>{paidPct}%</Text>
            </View>
          </View>
        </View>

        {/* Items table */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, styles.colDesc]}>Descripción</Text>
          <Text style={[styles.tableHeaderText, styles.colQty]}>Cant.</Text>
          <Text style={[styles.tableHeaderText, styles.colPrice]}>Precio Unit.</Text>
          <Text style={[styles.tableHeaderText, styles.colTotal]}>Total</Text>
        </View>
        {data.items.map((it, i) => (
          <View key={i} style={styles.tableRow} wrap={false}>
            <Text style={styles.colDesc}>{it.description}</Text>
            <Text style={styles.colQty}>{Number(it.quantity)}</Text>
            <Text style={styles.colPrice}>{fmtCOP(it.unit_price)}</Text>
            <Text style={styles.colTotal}>{fmtCOP(it.line_total)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsBox} wrap={false}>
          <View style={styles.totalsRow}><Text style={styles.muted}>Subtotal</Text><Text>{fmtCOP(data.subtotal)}</Text></View>
          <View style={styles.totalsRow}><Text style={styles.muted}>Descuento</Text><Text>- {fmtCOP(data.discount)}</Text></View>
          <View style={styles.totalsRow}><Text style={styles.muted}>Impuesto</Text><Text>+ {fmtCOP(data.tax)}</Text></View>
          <View style={styles.totalLine}>
            <Text style={{ fontWeight: 700, fontSize: 11 }}>TOTAL</Text>
            <Text style={{ fontWeight: 700, fontSize: 11, color: accent }}>{fmtCOP(data.total)}</Text>
          </View>
        </View>

        {/* Notes */}
        {data.notes ? (
          <View style={{ marginTop: 14 }} wrap={false}>
            <Text style={styles.panelTitle}>Notas</Text>
            <Text style={{ color: "#334155" }}>{data.notes}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>{data.brand.legal_name || data.brand.name} · Factura {data.invoice_number}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>

      {/* Terms & Conditions */}
      {data.terms_html ? (
        <Page size="LETTER" style={styles.page}>
          <Text style={[styles.termsHeader, { color: accent }]}>
            Términos y Condiciones de Venta
            {data.terms_version ? ` · v${data.terms_version}` : ""}
          </Text>
          {data.terms_html.split(/\n{2,}/).map((para, i) => (
            <Text key={i} style={styles.termsPara}>{para.trim()}</Text>
          ))}
          {data.brand.invoice_footer_note ? (
            <Text style={[styles.termsPara, { marginTop: 12, fontStyle: "italic", color: "#64748b" }]}>
              {data.brand.invoice_footer_note}
            </Text>
          ) : null}

          <View style={styles.footer} fixed>
            <Text>{data.brand.legal_name || data.brand.name} · Factura {data.invoice_number}</Text>
            <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
          </View>
        </Page>
      ) : null}
    </Document>
  );
}
