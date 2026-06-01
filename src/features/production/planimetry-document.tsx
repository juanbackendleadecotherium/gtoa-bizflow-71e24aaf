import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { getBrandLogo } from "@/features/invoices/brand-logos";

export type PlanimetryItem = {
  description: string;
  quantity: number;
  images: string[];
};

export type PlanimetryDocumentData = {
  production_code: string;
  invoice_number: string | null;
  order_number: string;
  sale_date?: string | null;
  estimated_delivery_date?: string | null;
  seller_name?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  customer_city?: string | null;
  notes?: string | null;
  brand: {
    name: string;
    slug?: string | null;
    legal_name?: string | null;
    logo_url?: string | null;
    primary_color?: string | null;
  };
  items: PlanimetryItem[];
};

// Palette — neutral warm grays with a single accent
const INK = "#1a1a1a";
const SUB = "#3d3d3d";
const MUTED = "#6b6b6b";
const CARD = "#c9c7c2";       // warm gray card (like reference)
const CARD_SOFT = "#d8d6d1";  // softer inner area
const PAPER = "#ebe9e4";      // page background
const LINE = "#9a9893";
const ACCENT_DEFAULT = "#e8542a"; // warm orange highlight

const styles = StyleSheet.create({
  page: {
    paddingTop: 18, paddingBottom: 36, paddingHorizontal: 18,
    fontSize: 10, color: INK, fontFamily: "Helvetica",
    backgroundColor: PAPER,
  },

  // === HEADER CARD ===========================================================
  headerCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 18,
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: 12,
  },
  headerLeft: { flex: 1, paddingRight: 12 },
  headerTitle: {
    fontSize: 13, fontWeight: 700, fontStyle: "italic",
    letterSpacing: 0.6, color: INK, marginBottom: 10,
  },
  headerMetaRow: { flexDirection: "row", marginBottom: 4 },
  headerMetaLabel: { fontSize: 11, fontStyle: "italic", color: INK, width: 78 },
  headerMetaValue: { fontSize: 11, fontWeight: 700, color: INK },

  headerRight: { alignItems: "flex-end", minWidth: 140 },
  factLabel: { fontSize: 11, fontStyle: "italic", color: INK },
  factNumber: { fontSize: 36, fontWeight: 700, color: INK, lineHeight: 1, marginTop: 2 },
  prodCode: { fontSize: 8, color: MUTED, marginTop: 4, letterSpacing: 0.8 },

  // === HERO / ITEM CARD ======================================================
  itemCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 14,
    marginBottom: 12,
  },
  itemTopRow: { flexDirection: "row", gap: 14 },

  // Left: BIG hero image + product label
  heroCol: { width: "44%" },
  heroImageBox: {
    width: "100%", height: 280, borderRadius: 10, overflow: "hidden",
    backgroundColor: CARD_SOFT, borderWidth: 0.5, borderColor: LINE,
  },
  heroImage: { width: "100%", height: "100%", objectFit: "cover" },
  heroNoImage: {
    width: "100%", height: 280, borderRadius: 10, borderWidth: 1, borderStyle: "dashed",
    borderColor: LINE, justifyContent: "center", alignItems: "center",
  },
  heroNoImageText: { fontSize: 9, color: MUTED, fontStyle: "italic" },
  heroProductName: {
    fontSize: 18, fontWeight: 700, fontStyle: "italic",
    color: INK, marginTop: 10,
  },
  heroProductCaption: { fontSize: 10, fontStyle: "italic", color: SUB, marginTop: 2 },

  // Right: specs (description)
  specsCol: { flex: 1, paddingTop: 2 },
  deliveryStrip: {
    flexDirection: "row", justifyContent: "flex-end", alignItems: "baseline",
    marginBottom: 10, gap: 8,
  },
  deliveryLabel: { fontSize: 11, fontWeight: 700, fontStyle: "italic", color: INK },
  deliveryValue: {
    fontSize: 13, fontWeight: 700, fontStyle: "italic",
    paddingHorizontal: 6, paddingVertical: 1,
  },
  qtyBadge: {
    alignSelf: "flex-start", marginBottom: 8,
    backgroundColor: "#1a1a1a", color: "#ffffff",
    fontSize: 9, fontWeight: 700, letterSpacing: 1,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  specsBody: { fontSize: 10.5, color: INK, lineHeight: 1.55 },

  // === SECONDARY IMAGES CARD =================================================
  refCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 14, marginBottom: 12,
  },
  refTitle: {
    fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase",
    color: SUB, marginBottom: 8,
  },
  refGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  refCell: { width: "33.333%", paddingHorizontal: 4, paddingBottom: 8 },
  refImageBox: {
    width: "100%", height: 150, borderRadius: 8, overflow: "hidden",
    backgroundColor: CARD_SOFT, borderWidth: 0.5, borderColor: LINE,
  },
  refImage: { width: "100%", height: "100%", objectFit: "cover" },
  refCaption: { fontSize: 8, color: MUTED, marginTop: 3, textAlign: "center", fontStyle: "italic" },

  // === NOTES =================================================================
  notesCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 14, marginBottom: 12,
  },
  notesLabel: {
    fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase",
    color: SUB, marginBottom: 6,
  },
  notesBody: { fontSize: 10.5, color: INK, lineHeight: 1.5 },

  // === FOOTER ================================================================
  footer: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 18, paddingTop: 8,
    position: "absolute", bottom: 14, left: 0, right: 0,
  },
  logoBox: { width: 90, height: 32, justifyContent: "center" },
  logo: { maxWidth: 90, maxHeight: 32, objectFit: "contain" },
  footerBrand: { fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: INK },
  footerText: { fontSize: 8, color: MUTED },
});

const fmtDate = (s?: string | null) => {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return s; }
};
const fmtDateLong = (s?: string | null) => {
  if (!s) return null;
  try {
    return new Date(s).toLocaleDateString("es-CO", { day: "2-digit", month: "long" });
  } catch { return s; }
};

export function PlanimetryDocument({ data }: { data: PlanimetryDocumentData }) {
  const logo = getBrandLogo(data.brand.slug, data.brand.logo_url);
  const accent = (data.brand.primary_color && /^#[0-9a-f]{3,8}$/i.test(data.brand.primary_color))
    ? data.brand.primary_color : ACCENT_DEFAULT;
  const deliveryLong = fmtDateLong(data.estimated_delivery_date);
  const factNumber = data.invoice_number || data.order_number;

  return (
    <Document title={`Planimetría ${data.production_code}`}>
      {data.items.map((it, idx) => {
        const lines = it.description.split(/\n+/).filter(Boolean);
        const title = lines[0] || `Producto ${idx + 1}`;
        const body = lines.slice(1).join("\n");
        const hero = it.images[0];
        const rest = it.images.slice(1);

        return (
          <Page key={idx} size="LETTER" style={styles.page}>
            {/* HEADER CARD — kept from previous design (logo & invoice) */}
            <View style={styles.headerCard}>
              <View style={styles.headerLeft}>
                <Text style={styles.headerTitle}>FICHA TÉCNICA DE PRODUCCIÓN</Text>
                <View style={styles.headerMetaRow}>
                  <Text style={styles.headerMetaLabel}>Cliente:</Text>
                  <Text style={styles.headerMetaValue}>{data.customer_name}</Text>
                </View>
                <View style={styles.headerMetaRow}>
                  <Text style={styles.headerMetaLabel}>Fecha:</Text>
                  <Text style={styles.headerMetaValue}>{fmtDate(data.sale_date ?? new Date().toISOString())}</Text>
                </View>
                {data.seller_name ? (
                  <View style={styles.headerMetaRow}>
                    <Text style={styles.headerMetaLabel}>Comercial:</Text>
                    <Text style={styles.headerMetaValue}>{data.seller_name}</Text>
                  </View>
                ) : null}
                {data.customer_city ? (
                  <View style={styles.headerMetaRow}>
                    <Text style={styles.headerMetaLabel}>Ciudad:</Text>
                    <Text style={styles.headerMetaValue}>{data.customer_city}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.headerRight}>
                <Text style={styles.factLabel}>
                  {data.invoice_number ? "Nro Fact:" : "Pedido:"}
                </Text>
                <Text style={styles.factNumber}>{factNumber}</Text>
                <Text style={styles.prodCode}>{data.production_code}</Text>
                {data.items.length > 1 && (
                  <Text style={[styles.prodCode, { marginTop: 2 }]}>
                    {idx + 1} / {data.items.length}
                  </Text>
                )}
              </View>
            </View>

            {/* MAIN ITEM CARD — hero image left, specs right */}
            <View style={styles.itemCard}>
              {deliveryLong ? (
                <View style={styles.deliveryStrip}>
                  <Text style={styles.deliveryLabel}>Fecha de entrega:</Text>
                  <Text style={[styles.deliveryValue, { color: accent }]}>{deliveryLong}</Text>
                </View>
              ) : null}

              <View style={styles.itemTopRow}>
                <View style={styles.heroCol}>
                  {hero ? (
                    <View style={styles.heroImageBox}>
                      <Image src={hero} style={styles.heroImage} />
                    </View>
                  ) : (
                    <View style={styles.heroNoImage}>
                      <Text style={styles.heroNoImageText}>Sin imagen de referencia</Text>
                    </View>
                  )}
                  <Text style={styles.heroProductName}>{title}</Text>
                  <Text style={styles.heroProductCaption}>Imágen de referencia</Text>
                </View>

                <View style={styles.specsCol}>
                  <Text style={styles.qtyBadge}>CANT · {Number(it.quantity)}</Text>
                  {body ? (
                    <Text style={styles.specsBody}>{body}</Text>
                  ) : (
                    <Text style={[styles.specsBody, { color: MUTED, fontStyle: "italic" }]}>
                      Sin especificaciones adicionales.
                    </Text>
                  )}
                </View>
              </View>
            </View>

            {/* ADDITIONAL REFERENCES — larger thumbnails */}
            {rest.length > 0 ? (
              <View style={styles.refCard} wrap={false}>
                <Text style={styles.refTitle}>Referencias adicionales</Text>
                <View style={styles.refGrid}>
                  {rest.map((url, i) => (
                    <View key={i} style={styles.refCell}>
                      <View style={styles.refImageBox}>
                        <Image src={url} style={styles.refImage} />
                      </View>
                      <Text style={styles.refCaption}>Referencia {i + 2}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* NOTES — only on last page */}
            {data.notes && idx === data.items.length - 1 ? (
              <View style={styles.notesCard} wrap={false}>
                <Text style={styles.notesLabel}>Notas de la venta</Text>
                <Text style={styles.notesBody}>{data.notes}</Text>
              </View>
            ) : null}

            {/* FOOTER — logo left, page number right */}
            <View style={styles.footer} fixed>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {logo ? (
                  <View style={styles.logoBox}>
                    <Image src={logo} style={styles.logo} />
                  </View>
                ) : null}
                <Text style={styles.footerBrand}>
                  {(data.brand.legal_name || data.brand.name).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.footerText}
                render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
