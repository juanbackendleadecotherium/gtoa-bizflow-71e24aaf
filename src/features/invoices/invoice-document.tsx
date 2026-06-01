import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { getBrandLogo } from "./brand-logos";
import { numberToSpanishWords } from "./number-to-words";

export type InvoiceBrandSnapshot = {
  name: string;
  slug?: string | null;
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
  seller_name?: string | null;
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
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  } catch {
    return s;
  }
};

const INK = "#1f2937";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const SOFT_BG = "#f8fafc";

const styles = StyleSheet.create({
  page: {
    paddingTop: 32, paddingBottom: 56, paddingHorizontal: 36,
    fontSize: 9, color: INK, fontFamily: "Helvetica",
  },

  /* Header */
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brandBlock: { flexDirection: "column", maxWidth: "60%" },
  logoBox: {
    backgroundColor: SOFT_BG, borderRadius: 4, padding: 10,
    width: 200, height: 90, alignItems: "center", justifyContent: "center",
    marginBottom: 8,
  },
  logo: { maxWidth: 180, maxHeight: 70, objectFit: "contain" },
  brandName: { fontSize: 13, fontWeight: 700, marginTop: 2 },
  brandLine: { color: MUTED, fontSize: 8.5, marginTop: 1 },

  invoiceMeta: { alignItems: "flex-end", maxWidth: "40%" },
  invoiceLabel: { fontSize: 11, color: MUTED },
  invoiceNumber: { fontSize: 28, fontWeight: 700, color: INK, lineHeight: 1 },
  metaDate: { fontSize: 9, marginTop: 8 },
  metaDateLabel: { fontWeight: 700 },

  divider: { borderBottomWidth: 1, borderBottomColor: LINE, marginTop: 12, marginBottom: 10 },

  /* Client / seller row */
  partyRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  partyLeft: { maxWidth: "60%" },
  partyRight: { alignItems: "flex-end" },
  partyLine: { marginBottom: 2 },
  bold: { fontWeight: 700 },

  /* Items table */
  th: {
    flexDirection: "row", backgroundColor: SOFT_BG,
    paddingVertical: 6, paddingHorizontal: 6, marginTop: 4,
  },
  thText: { fontSize: 8.5, color: MUTED, fontWeight: 700 },
  row: {
    flexDirection: "row", paddingVertical: 8, paddingHorizontal: 6,
    borderBottomWidth: 0.5, borderBottomColor: LINE,
  },
  cId: { width: 22 },
  cItem: { flex: 4, paddingRight: 6 },
  cUnit: { width: 50 },
  cQty: { width: 38, textAlign: "right" },
  cPrice: { width: 60, textAlign: "right" },
  cDisc: { width: 55, textAlign: "right" },
  cTax: { width: 50, textAlign: "right" },
  cSub: { width: 70, textAlign: "right" },

  itemTitle: { fontWeight: 700, marginBottom: 2 },
  itemDesc: { color: MUTED, fontSize: 8.5 },

  wordsRow: {
    flexDirection: "row", backgroundColor: SOFT_BG,
    padding: 8, marginTop: 2, marginBottom: 10,
  },

  countLine: { marginBottom: 14 },

  /* Totals */
  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8 },
  totalsBox: { width: "55%" },
  tRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, paddingHorizontal: 6 },
  tLabel: { color: MUTED },
  tValue: { },
  tTotalRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingTop: 8, paddingBottom: 6, paddingHorizontal: 6,
    borderTopWidth: 1, borderTopColor: INK, marginTop: 4,
  },
  tTotalLabel: { fontSize: 14, fontWeight: 700 },
  tTotalValue: { fontSize: 14, fontWeight: 700 },

  /* Notes */
  notesBox: { marginTop: 14, padding: 10, borderRadius: 4, borderWidth: 0.5, borderColor: LINE },
  notesTitle: { fontSize: 8, color: MUTED, fontWeight: 700, marginBottom: 4, letterSpacing: 0.8 },

  /* Footer meta */
  metaBlock: {
    position: "absolute", bottom: 56, left: 36, right: 36,
    flexDirection: "row", gap: 16,
  },
  metaItem: { fontSize: 8.5 },
  metaItemLabel: { fontWeight: 700 },

  footer: {
    position: "absolute", bottom: 24, left: 36, right: 36,
    flexDirection: "row", justifyContent: "space-between",
    borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 6,
    fontSize: 7.5, color: "#9ca3af",
  },
});

export function InvoiceDocument({ data }: { data: InvoiceDocumentData }) {
  const logo = getBrandLogo(data.brand.slug, data.brand.logo_url);
  const totalWords = numberToSpanishWords(Math.round(Number(data.total) || 0));

  return (
    <Document title={`Factura ${data.invoice_number}`}>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <View style={styles.logoBox}>
              {logo ? <Image src={logo} style={styles.logo} /> : <Text style={{ color: MUTED }}>{data.brand.name}</Text>}
            </View>
            <Text style={styles.brandName}>{(data.brand.legal_name || data.brand.name).toUpperCase()}</Text>
            {data.brand.legal_name && data.brand.tax_id ? (
              <Text style={styles.brandLine}>{data.brand.legal_name} - NIT {data.brand.tax_id}</Text>
            ) : data.brand.tax_id ? (
              <Text style={styles.brandLine}>NIT {data.brand.tax_id}</Text>
            ) : null}
            {data.brand.address ? (
              <Text style={styles.brandLine}>
                {data.brand.address}{data.brand.city ? `, ${data.brand.city}` : ""}
              </Text>
            ) : null}
            {data.brand.email ? <Text style={styles.brandLine}>{data.brand.email}</Text> : null}
            {data.brand.phone ? <Text style={styles.brandLine}>Tel: {data.brand.phone}</Text> : null}
          </View>

          <View style={styles.invoiceMeta}>
            <Text style={styles.invoiceLabel}>Factura de venta</Text>
            <Text style={styles.invoiceNumber}>{data.invoice_number}</Text>
            <Text style={styles.metaDate}>
              <Text style={styles.metaDateLabel}>Fecha de creación: </Text>{fmtDate(data.issued_at)}
            </Text>
            {data.sale_date ? (
              <Text style={styles.metaDate}>
                <Text style={styles.metaDateLabel}>Fecha de venta: </Text>{fmtDate(data.sale_date)}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Client / seller */}
        <View style={styles.partyRow}>
          <View style={styles.partyLeft}>
            <Text style={styles.partyLine}>
              <Text style={styles.bold}>Cliente: </Text>{data.customer.name || "—"}
            </Text>
            {data.customer.company ? (
              <Text style={styles.partyLine}>
                <Text style={styles.bold}>Empresa: </Text>{data.customer.company}
              </Text>
            ) : null}
            {data.customer.doc_number ? (
              <Text style={styles.partyLine}>
                <Text style={styles.bold}>{data.customer.doc_type || "ID"}: </Text>{data.customer.doc_number}
              </Text>
            ) : null}
            {data.customer.email ? (
              <Text style={styles.partyLine}>
                <Text style={styles.bold}>Email: </Text>{data.customer.email}
              </Text>
            ) : null}
            {data.customer.phone ? (
              <Text style={styles.partyLine}>
                <Text style={styles.bold}>Tel: </Text>{data.customer.phone}
              </Text>
            ) : null}
          </View>
          <View style={styles.partyRight}>
            {data.seller_name ? (
              <Text style={styles.partyLine}>
                <Text style={styles.bold}>Vendedor: </Text>{data.seller_name}
              </Text>
            ) : null}
            <Text style={styles.partyLine}><Text style={styles.bold}>Moneda: </Text>COP</Text>
            <Text style={styles.partyLine}><Text style={styles.bold}>Orden: </Text>{data.order_number}</Text>
          </View>
        </View>

        {/* Items table */}
        <View style={styles.th}>
          <Text style={[styles.thText, styles.cId]}>ID</Text>
          <Text style={[styles.thText, styles.cItem]}>Ítem</Text>
          <Text style={[styles.thText, styles.cUnit]}>Unidad</Text>
          <Text style={[styles.thText, styles.cQty]}>Cant.</Text>
          <Text style={[styles.thText, styles.cPrice]}>Precio</Text>
          <Text style={[styles.thText, styles.cDisc]}>Descuento</Text>
          <Text style={[styles.thText, styles.cTax]}>Impuesto</Text>
          <Text style={[styles.thText, styles.cSub]}>Subtotal</Text>
        </View>

        {data.items.map((it, i) => {
          const lines = it.description.split(/\n+/);
          const title = lines[0] || "";
          const detail = lines.slice(1).join(" ");
          return (
            <View key={i} style={styles.row} wrap={false}>
              <Text style={styles.cId}>{i + 1}</Text>
              <View style={styles.cItem}>
                <Text style={styles.itemTitle}>{title}</Text>
                {detail ? <Text style={styles.itemDesc}>{detail}</Text> : null}
              </View>
              <Text style={styles.cUnit}>Unidad</Text>
              <Text style={styles.cQty}>{Number(it.quantity)}</Text>
              <Text style={styles.cPrice}>{fmtCOP(it.unit_price)}</Text>
              <Text style={styles.cDisc}></Text>
              <Text style={styles.cTax}></Text>
              <Text style={styles.cSub}>{fmtCOP(it.line_total)}</Text>
            </View>
          );
        })}

        {/* Words row */}
        <View style={styles.wordsRow}>
          <Text style={{ color: INK }}>{totalWords}</Text>
        </View>

        <Text style={styles.countLine}>
          <Text style={styles.bold}>Total de líneas: </Text>{data.items.length}
        </Text>

        {/* Totals */}
        <View style={styles.totalsWrap} wrap={false}>
          <View style={styles.totalsBox}>
            <View style={styles.tRow}>
              <Text style={styles.tLabel}>Subtotal</Text>
              <Text style={styles.tValue}>{fmtCOP(data.subtotal)}</Text>
            </View>
            {Number(data.discount) > 0 ? (
              <View style={styles.tRow}>
                <Text style={styles.tLabel}>Descuento</Text>
                <Text style={styles.tValue}>- {fmtCOP(data.discount)}</Text>
              </View>
            ) : null}
            {Number(data.tax) > 0 ? (
              <View style={styles.tRow}>
                <Text style={styles.tLabel}>Impuesto</Text>
                <Text style={styles.tValue}>+ {fmtCOP(data.tax)}</Text>
              </View>
            ) : null}
            <View style={styles.tTotalRow}>
              <Text style={styles.tTotalLabel}>Total</Text>
              <Text style={styles.tTotalValue}>{fmtCOP(data.total)}</Text>
            </View>
            {Number(data.advance) > 0 ? (
              <>
                <View style={[styles.tRow, { marginTop: 6 }]}>
                  <Text style={styles.tLabel}>Abono recibido</Text>
                  <Text style={styles.tValue}>{fmtCOP(data.advance)}</Text>
                </View>
                <View style={styles.tRow}>
                  <Text style={[styles.tLabel, styles.bold]}>Saldo pendiente</Text>
                  <Text style={styles.bold}>{fmtCOP(data.balance)}</Text>
                </View>
              </>
            ) : null}
          </View>
        </View>

        {/* Notes */}
        {data.notes ? (
          <View style={styles.notesBox} wrap={false}>
            <Text style={styles.notesTitle}>NOTAS</Text>
            <Text style={{ color: "#374151" }}>{data.notes}</Text>
          </View>
        ) : null}

        {/* Payment meta */}
        <View style={styles.metaBlock} fixed>
          <Text style={styles.metaItem}>
            <Text style={styles.metaItemLabel}>Forma de pago: </Text>{data.payment_method || "—"}
          </Text>
          <Text style={styles.metaItem}>
            <Text style={styles.metaItemLabel}>Tipo de factura: </Text>Factura de venta
          </Text>
          <Text style={styles.metaItem}>
            <Text style={styles.metaItemLabel}>Generado: </Text>{new Date(data.issued_at).toLocaleString("es-CO")}
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>{data.brand.legal_name || data.brand.name} · Factura {data.invoice_number}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
