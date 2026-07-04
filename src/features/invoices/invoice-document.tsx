import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { getBrandLogo, getBrandInvoiceColor } from "./brand-logos";
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
  version_number?: number;
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
  } catch { return s; }
};

const INK = "#0f172a";
const SUB = "#475569";
const MUTED = "#94a3b8";
const LINE = "#e2e8f0";
const SOFT = "#f8fafc";
const ROW_ALT = "#fbfcfe";

const PAGE_PX = 56; // ~2cm APA-style horizontal margin
const PAGE_PY_TOP = 48;
const PAGE_PY_BOTTOM = 130;

const styles = StyleSheet.create({
  page: {
    paddingTop: PAGE_PY_TOP,
    paddingBottom: PAGE_PY_BOTTOM,
    paddingHorizontal: PAGE_PX,
    fontSize: 9.5, color: INK, fontFamily: "Helvetica",
  },

  /* Accent bar — full-bleed above the page padding */
  accent: { position: "absolute", top: 0, left: 0, right: 0, height: 6 },

  /* Header */
  headerWrap: { paddingBottom: 18 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brandCol: { maxWidth: "55%" },
  logoBox: {
    width: 220, height: 90, alignItems: "flex-start", justifyContent: "center",
    marginBottom: 10,
  },
  logo: { maxWidth: 220, maxHeight: 90, objectFit: "contain" },
  brandName: { fontSize: 11, fontWeight: 700, color: INK, letterSpacing: 0.4 },
  brandLine: { color: SUB, fontSize: 9, marginTop: 2, lineHeight: 1.45 },

  metaCol: { alignItems: "flex-end", maxWidth: "45%" },
  metaTag: {
    fontSize: 8, color: MUTED, letterSpacing: 1.6, fontWeight: 700,
    marginBottom: 2, textTransform: "uppercase",
  },
  invoiceNumber: { fontSize: 26, fontWeight: 700, color: INK, lineHeight: 1, marginBottom: 10 },
  metaPair: { flexDirection: "row", gap: 8, marginTop: 2 },
  metaLabel: { fontSize: 8.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8 },
  metaValue: { fontSize: 9.5, color: INK, fontWeight: 700 },
  versionPill: {
    marginTop: 8, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 0.5, borderColor: LINE, borderRadius: 10,
    fontSize: 7.5, color: SUB, letterSpacing: 0.6, textTransform: "uppercase",
  },

  /* Party cards */
  partiesWrap: { marginTop: 4, marginBottom: 14, flexDirection: "row", gap: 12 },
  partyCard: {
    flex: 1, padding: 12, borderRadius: 6, backgroundColor: SOFT, borderWidth: 0.5, borderColor: LINE,
  },
  partyTag: {
    fontSize: 7.5, color: MUTED, letterSpacing: 1.4, fontWeight: 700,
    marginBottom: 6, textTransform: "uppercase",
  },
  partyName: { fontSize: 11, fontWeight: 700, color: INK, marginBottom: 4 },
  partyLine: { color: SUB, fontSize: 9, lineHeight: 1.45 },

  /* Items table */
  tableWrap: {},
  th: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 1 },
  thText: { fontSize: 7.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" },
  row: {
    flexDirection: "row", paddingVertical: 9, paddingHorizontal: 6,
    borderBottomWidth: 0.5, borderBottomColor: LINE,
  },
  rowAlt: { backgroundColor: ROW_ALT },
  cIdx: { width: 22, color: MUTED },
  cItem: { flex: 4, paddingRight: 8 },
  cQty: { width: 38, textAlign: "right" },
  cPrice: { width: 75, textAlign: "right" },
  cSub: { width: 85, textAlign: "right", fontWeight: 700 },

  itemTitle: { fontWeight: 700, color: INK, marginBottom: 2 },
  itemDesc: { color: SUB, fontSize: 8.8, lineHeight: 1.4 },

  /* Words bar */
  wordsRow: {
    marginTop: 14, paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: SOFT, borderLeftWidth: 3, borderRadius: 2,
  },
  wordsLabel: { fontSize: 7.5, color: MUTED, letterSpacing: 1.2, fontWeight: 700, marginBottom: 2 },
  wordsText: { color: INK, fontSize: 10, fontStyle: "italic" },

  /* Totals */
  bottomRow: { flexDirection: "row", marginTop: 16, marginBottom: 24, gap: 16 },
  notesCol: { flex: 1.1 },
  totalsCol: { flex: 1 },
  notesTitle: { fontSize: 7.5, color: MUTED, fontWeight: 700, letterSpacing: 1.4, marginBottom: 6, textTransform: "uppercase" },
  notesBody: { color: SUB, fontSize: 9, lineHeight: 1.5 },

  tRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  tLabel: { color: SUB, fontSize: 9.5 },
  tValue: { color: INK, fontSize: 9.5 },
  divider: { borderBottomWidth: 0.5, borderBottomColor: LINE, marginVertical: 4 },
  totalBox: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 4, marginTop: 6,
  },
  totalLabel: { color: "#ffffff", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase" },
  totalValue: { color: "#ffffff", fontSize: 16, fontWeight: 700 },

  payRow: {
    flexDirection: "row", justifyContent: "space-between",
    marginTop: 8, paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 4, borderWidth: 0.5, borderColor: LINE, backgroundColor: SOFT,
  },
  payLabel: { fontSize: 9, color: SUB },
  payValue: { fontSize: 10, color: INK, fontWeight: 700 },

  /* Footer */
  footerBlock: {
    position: "absolute", bottom: 36, left: PAGE_PX, right: PAGE_PX,
    paddingTop: 8, borderTopWidth: 0.5, borderTopColor: LINE,
  },
  footerTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  footerMeta: { fontSize: 8, color: SUB },
  footerNote: { fontSize: 7.5, color: MUTED, textAlign: "center", marginTop: 4 },
});

export function InvoiceDocument({ data }: { data: InvoiceDocumentData }) {
  const logo = getBrandLogo(data.brand.slug, data.brand.logo_url);
  const accent = (data.brand.primary_color && /^#[0-9a-f]{3,8}$/i.test(data.brand.primary_color))
    ? data.brand.primary_color : "#0f172a";
  const totalWords = numberToSpanishWords(Math.round(Number(data.total) || 0));

  return (
    <Document title={`Cuenta de cobro ${data.invoice_number}`}>
      <Page size="LETTER" style={styles.page}>
        {/* Accent stripe */}
        <View style={[styles.accent, { backgroundColor: accent }]} fixed />

        {/* Header */}
        <View style={styles.headerWrap}>
          <View style={styles.headerRow}>
            <View style={styles.brandCol}>
              <View style={styles.logoBox}>
                {logo ? <Image src={logo} style={styles.logo} /> : (
                  <Text style={{ fontSize: 18, fontWeight: 700, color: accent }}>{data.brand.name}</Text>
                )}
              </View>
              <Text style={styles.brandName}>{(data.brand.legal_name || data.brand.name).toUpperCase()}</Text>
              {data.brand.tax_id ? <Text style={styles.brandLine}>NIT {data.brand.tax_id}</Text> : null}
              {data.brand.address ? (
                <Text style={styles.brandLine}>
                  {data.brand.address}{data.brand.city ? ` · ${data.brand.city}` : ""}
                </Text>
              ) : null}
              {(data.brand.phone || data.brand.email) ? (
                <Text style={styles.brandLine}>
                  {[data.brand.phone, data.brand.email].filter(Boolean).join("  ·  ")}
                </Text>
              ) : null}
              {data.brand.website ? <Text style={styles.brandLine}>{data.brand.website}</Text> : null}
            </View>

            <View style={styles.metaCol}>
              <Text style={styles.metaTag}>Cuenta de cobro de venta</Text>
              <Text style={[styles.invoiceNumber, { color: accent }]}>{data.invoice_number}</Text>

              <View style={styles.metaPair}>
                <Text style={styles.metaLabel}>Emisión</Text>
                <Text style={styles.metaValue}>{fmtDate(data.issued_at)}</Text>
              </View>
              {data.sale_date ? (
                <View style={styles.metaPair}>
                  <Text style={styles.metaLabel}>Venta</Text>
                  <Text style={styles.metaValue}>{fmtDate(data.sale_date)}</Text>
                </View>
              ) : null}
              <View style={styles.metaPair}>
                <Text style={styles.metaLabel}>Orden</Text>
                <Text style={styles.metaValue}>{data.order_number}</Text>
              </View>
              <View style={styles.metaPair}>
                <Text style={styles.metaLabel}>Moneda</Text>
                <Text style={styles.metaValue}>COP</Text>
              </View>

              {data.version_number && data.version_number > 1 ? (
                <Text style={styles.versionPill}>Versión {data.version_number}</Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Parties */}
        <View style={styles.partiesWrap}>
          <View style={styles.partyCard}>
            <Text style={styles.partyTag}>Cobrar a</Text>
            <Text style={styles.partyName}>{data.customer.name || "—"}</Text>
            {data.customer.company ? <Text style={styles.partyLine}>{data.customer.company}</Text> : null}
            {data.customer.doc_number ? (
              <Text style={styles.partyLine}>
                {data.customer.doc_type || "ID"}: {data.customer.doc_number}
              </Text>
            ) : null}
            {data.customer.address ? (
              <Text style={styles.partyLine}>
                {data.customer.address}
                {data.customer.city ? `, ${data.customer.city}` : ""}
                {data.customer.department ? `, ${data.customer.department}` : ""}
              </Text>
            ) : null}
            {data.customer.phone ? <Text style={styles.partyLine}>Tel. {data.customer.phone}</Text> : null}
            {data.customer.email ? <Text style={styles.partyLine}>{data.customer.email}</Text> : null}
          </View>

          <View style={styles.partyCard}>
            <Text style={styles.partyTag}>Detalle de pago</Text>
            <Text style={styles.partyName}>{data.payment_method || "Por definir"}</Text>
            {data.seller_name ? (
              <Text style={styles.partyLine}>Asesor: {data.seller_name}</Text>
            ) : null}
            <Text style={styles.partyLine}>Tipo: Cuenta de cobro de venta</Text>
            <Text style={styles.partyLine}>{data.items.length} producto{data.items.length === 1 ? "" : "s"}</Text>
          </View>
        </View>

        {/* Items table */}
        <View style={styles.tableWrap}>
          <View style={[styles.th, { borderBottomColor: accent, backgroundColor: SOFT }]} fixed>
            <Text style={[styles.thText, styles.cIdx, { color: SUB }]}>#</Text>
            <Text style={[styles.thText, styles.cItem, { color: SUB }]}>Descripción</Text>
            <Text style={[styles.thText, styles.cQty, { color: SUB }]}>Cant.</Text>
            <Text style={[styles.thText, styles.cPrice, { color: SUB }]}>Precio</Text>
            <Text style={[styles.thText, styles.cSub, { color: SUB }]}>Subtotal</Text>
          </View>

          {data.items.map((it, i) => {
            const lines = it.description.split(/\n+/);
            const title = lines[0] || "";
            const detail = lines.slice(1).join(" ");
            return (
              <View key={i} style={i % 2 === 1 ? [styles.row, styles.rowAlt] : styles.row} wrap={false}>
                <Text style={styles.cIdx}>{String(i + 1).padStart(2, "0")}</Text>
                <View style={styles.cItem}>
                  <Text style={styles.itemTitle}>{title}</Text>
                  {detail ? <Text style={styles.itemDesc}>{detail}</Text> : null}
                </View>
                <Text style={styles.cQty}>{Number(it.quantity)}</Text>
                <Text style={styles.cPrice}>{fmtCOP(it.unit_price)}</Text>
                <Text style={styles.cSub}>{fmtCOP(it.line_total)}</Text>
              </View>
            );
          })}
        </View>

        {/* Words bar */}
        <View style={[styles.wordsRow, { borderLeftColor: accent }]}>
          <Text style={styles.wordsLabel}>Valor en letras</Text>
          <Text style={styles.wordsText}>{totalWords}</Text>
        </View>

        {/* Notes + Totals */}
        <View style={styles.bottomRow} wrap={false}>
          <View style={styles.notesCol}>
            {data.notes ? (
              <>
                <Text style={styles.notesTitle}>Notas</Text>
                <Text style={styles.notesBody}>{data.notes}</Text>
              </>
            ) : null}
            {data.brand.invoice_footer_note ? (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.notesTitle}>Información adicional</Text>
                <Text style={styles.notesBody}>{data.brand.invoice_footer_note}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.totalsCol}>
            <View style={styles.tRow}>
              <Text style={styles.tLabel}>Subtotal</Text>
              <Text style={styles.tValue}>{fmtCOP(data.subtotal)}</Text>
            </View>
            {Number(data.discount) > 0 ? (
              <View style={styles.tRow}>
                <Text style={styles.tLabel}>Descuento</Text>
                <Text style={styles.tValue}>− {fmtCOP(data.discount)}</Text>
              </View>
            ) : null}
            {Number(data.tax) > 0 ? (
              <View style={styles.tRow}>
                <Text style={styles.tLabel}>Impuesto</Text>
                <Text style={styles.tValue}>+ {fmtCOP(data.tax)}</Text>
              </View>
            ) : null}
            <View style={styles.divider} />
            <View style={[styles.totalBox, { backgroundColor: accent }]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{fmtCOP(data.total)}</Text>
            </View>
            {Number(data.advance) > 0 ? (
              <>
                <View style={styles.payRow}>
                  <Text style={styles.payLabel}>Abono recibido</Text>
                  <Text style={styles.payValue}>{fmtCOP(data.advance)}</Text>
                </View>
                <View style={[styles.payRow, { backgroundColor: "#fff" }]}>
                  <Text style={[styles.payLabel, { fontWeight: 700, color: INK }]}>Saldo pendiente</Text>
                  <Text style={[styles.payValue, { color: accent }]}>{fmtCOP(data.balance)}</Text>
                </View>
              </>
            ) : null}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footerBlock} fixed>
          <View style={styles.footerTop}>
            <Text style={styles.footerMeta}>
              {data.brand.legal_name || data.brand.name} · Cuenta de cobro {data.invoice_number}
              {data.version_number && data.version_number > 1 ? ` · v${data.version_number}` : ""}
            </Text>
            <Text style={styles.footerMeta} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
          </View>
          <Text style={styles.footerNote}>
            Gracias por su compra. Documento generado electrónicamente el {new Date(data.issued_at).toLocaleString("es-CO")}.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
