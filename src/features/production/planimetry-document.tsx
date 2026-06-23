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

// Palette — print-friendly: white paper, black ink, single restrained accent.
// Color fills are intentionally avoided so toner is spent on the reference
// images, not on background panels.
const INK = "#111111";
const SUB = "#333333";
const MUTED = "#777777";
const PAPER = "#ffffff";
const LINE = "#cfcfcf";
const RULE = "#1a1a1a";
const ACCENT_DEFAULT = "#b3321a"; // used only as a thin accent on the delivery date

// Page margins — generous so wrapped content never touches the edge
const PAGE_MARGIN_X = 28;
const PAGE_MARGIN_TOP = 22;
const PAGE_MARGIN_BOTTOM = 64;

const styles = StyleSheet.create({
  page: {
    paddingTop: PAGE_MARGIN_TOP,
    paddingBottom: PAGE_MARGIN_BOTTOM,
    paddingHorizontal: PAGE_MARGIN_X,
    fontSize: 9.5,
    color: INK,
    fontFamily: "Helvetica",
    backgroundColor: PAPER,
  },

  // === HEADER — top rule + clean type, no colored panel =====================
  headerTopRule: {
    height: 2,
    backgroundColor: RULE,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 10,
    marginBottom: 12,
    borderBottomWidth: 0.6,
    borderBottomColor: LINE,
    borderBottomStyle: "solid",
  },
  headerLeft: { flex: 1, paddingRight: 12 },
  headerEyebrow: {
    fontSize: 7.5,
    letterSpacing: 2,
    color: MUTED,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 0.4,
    color: INK,
    marginBottom: 8,
  },
  headerMetaRow: { flexDirection: "row", marginBottom: 2 },
  headerMetaLabel: { fontSize: 9.5, color: MUTED, width: 64 },
  headerMetaValue: { fontSize: 9.5, fontWeight: 700, color: INK },

  headerRight: { alignItems: "flex-end", minWidth: 130 },
  factLabel: { fontSize: 8, letterSpacing: 1.8, color: MUTED },
  factNumber: { fontSize: 30, fontWeight: 700, color: INK, lineHeight: 1, marginTop: 2 },
  prodCode: { fontSize: 7.5, color: MUTED, marginTop: 4, letterSpacing: 0.8 },

  // === SECTION HEADINGS (used across cards) =================================
  sectionLabel: {
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: SUB,
    marginBottom: 6,
  },

  // === MAIN TWO-COLUMN BLOCK ================================================
  mainRow: { flexDirection: "row", gap: 14, marginBottom: 14 },
  mainLeft: { width: "44%" },
  mainRight: { width: "56%", flexDirection: "column" },

  heroFrame: {
    borderWidth: 0.6,
    borderColor: LINE,
    borderStyle: "solid",
    padding: 6,
  },
  heroImage: {
    width: "100%",
    height: 230,
    objectFit: "cover",
  },
  heroNoImage: {
    width: "100%",
    height: 230,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: LINE,
    justifyContent: "center",
    alignItems: "center",
  },
  heroNoImageText: { fontSize: 9, color: MUTED, fontStyle: "italic" },
  heroProductName: {
    fontSize: 15,
    fontWeight: 700,
    color: INK,
    marginTop: 8,
  },
  heroProductCaption: { fontSize: 8.5, color: MUTED, marginTop: 1, letterSpacing: 0.4 },

  // Right column — specs / delivery
  specsTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 0.6,
    borderBottomColor: LINE,
    borderBottomStyle: "solid",
  },
  qtyBadge: {
    borderWidth: 0.8,
    borderColor: INK,
    borderStyle: "solid",
    color: INK,
    fontSize: 8.5,
    fontWeight: 700,
    letterSpacing: 1.2,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  deliveryBlock: { alignItems: "flex-end" },
  deliveryLabel: { fontSize: 8, letterSpacing: 1.6, color: MUTED, textTransform: "uppercase" },
  deliveryValue: { fontSize: 13, fontWeight: 700, marginTop: 2 },

  specsBody: { fontSize: 10, color: INK, lineHeight: 1.55 },

  // === REFERENCES GRID — small thumbnails side by side ======================
  refSection: {
    marginBottom: 14,
    paddingTop: 10,
    borderTopWidth: 0.6,
    borderTopColor: LINE,
    borderTopStyle: "solid",
  },
  refGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 },
  refCell: {
    width: "33.333%",
    paddingHorizontal: 5,
    paddingBottom: 10,
  },
  refImageFrame: {
    borderWidth: 0.6,
    borderColor: LINE,
    borderStyle: "solid",
    padding: 4,
  },
  refImage: {
    width: "100%",
    height: 130,
    objectFit: "cover",
  },
  refCaption: {
    fontSize: 7.5,
    color: MUTED,
    marginTop: 4,
    textAlign: "center",
    letterSpacing: 0.4,
  },

  // === NOTES ================================================================
  notesSection: {
    marginBottom: 10,
    paddingTop: 10,
    borderTopWidth: 0.6,
    borderTopColor: LINE,
    borderTopStyle: "solid",
  },
  notesBody: { fontSize: 10, color: INK, lineHeight: 1.5 },

  // === FOOTER ===============================================================
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: PAGE_MARGIN_X,
    paddingTop: 8,
    borderTopWidth: 0.6,
    borderTopColor: LINE,
    borderTopStyle: "solid",
    position: "absolute",
    bottom: 18,
    left: 0,
    right: 0,
    backgroundColor: PAPER,
  },
  logoBox: { width: 72, height: 26, justifyContent: "center" },
  logo: { maxWidth: 72, maxHeight: 26, objectFit: "contain" },
  footerBrand: { fontSize: 8, fontWeight: 700, letterSpacing: 1.4, color: INK },
  footerText: { fontSize: 8, color: MUTED },
});

const fmtDate = (s?: string | null) => {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return s;
  }
};
const fmtDateLong = (s?: string | null) => {
  if (!s) return null;
  try {
    return new Date(s).toLocaleDateString("es-CO", { day: "2-digit", month: "long" });
  } catch {
    return s;
  }
};

export function PlanimetryDocument({ data }: { data: PlanimetryDocumentData }) {
  const logo = getBrandLogo(data.brand.slug, data.brand.logo_url);
  const accent =
    data.brand.primary_color && /^#[0-9a-f]{3,8}$/i.test(data.brand.primary_color)
      ? data.brand.primary_color
      : ACCENT_DEFAULT;
  const deliveryLong = fmtDateLong(data.estimated_delivery_date);
  const factNumber = data.invoice_number || data.order_number;

  return (
    <Document title={`Planimetría ${data.production_code}`}>
      {data.items.map((it, idx) => {
        const lines = it.description.split(/\n+/).map((l) => l.trim()).filter(Boolean);
        const title = lines[0] || `Producto ${idx + 1}`;
        const body = it.description.trim();
        const hero = it.images[0];
        const rest = it.images.slice(1);

        return (
          <Page key={idx} size="LETTER" style={styles.page}>
            {/* HEADER CARD */}
            <View style={styles.headerCard}>
              <View style={styles.headerLeft}>
                <Text style={styles.headerTitle}>FICHA TÉCNICA DE PRODUCCIÓN</Text>
                <View style={styles.headerMetaRow}>
                  <Text style={styles.headerMetaLabel}>Cliente:</Text>
                  <Text style={styles.headerMetaValue}>{data.customer_name}</Text>
                </View>
                <View style={styles.headerMetaRow}>
                  <Text style={styles.headerMetaLabel}>Fecha:</Text>
                  <Text style={styles.headerMetaValue}>
                    {fmtDate(data.sale_date ?? new Date().toISOString())}
                  </Text>
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

            {/* MAIN ROW — hero image LEFT, specs RIGHT (like reference) */}
            <View style={styles.mainRow} wrap={false}>
              <View style={styles.mainLeft}>
                <View style={styles.heroCard}>
                  {hero ? (
                    <Image src={hero} style={styles.heroImage} />
                  ) : (
                    <View style={styles.heroNoImage}>
                      <Text style={styles.heroNoImageText}>Sin imagen de referencia</Text>
                    </View>
                  )}
                  <Text style={styles.heroProductName}>{title}</Text>
                  <Text style={styles.heroProductCaption}>Imagen de referencia</Text>
                </View>
              </View>

              <View style={styles.mainRight}>
                <View style={styles.specsCard}>
                  <View style={styles.specsTopRow}>
                    <Text style={styles.qtyBadge}>CANT · {Number(it.quantity)}</Text>
                    {deliveryLong ? (
                      <View style={styles.deliveryBlock}>
                        <Text style={styles.deliveryLabel}>Fecha de entrega:</Text>
                        <Text style={[styles.deliveryValue, { color: accent }]}>
                          {deliveryLong}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <Text style={styles.specsLabel}>Especificaciones</Text>
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

            {/* REFERENCES — small thumbnails side by side in a 3-column grid */}
            {rest.length > 0 ? (
              <View style={styles.refCard}>
                <Text style={styles.refTitle}>Referencias adicionales</Text>
                <View style={styles.refGrid}>
                  {rest.map((url, i) => (
                    <View key={i} style={styles.refCell} wrap={false}>
                      <Image src={url} style={styles.refImage} />
                      <Text style={styles.refCaption}>Referencia {i + 2}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* NOTES — only last item */}
            {data.notes && idx === data.items.length - 1 ? (
              <View style={styles.notesCard} wrap={false}>
                <Text style={styles.notesLabel}>Notas de la venta</Text>
                <Text style={styles.notesBody}>{data.notes}</Text>
              </View>
            ) : null}

            {/* FOOTER */}
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
              <Text
                style={styles.footerText}
                render={({ pageNumber, totalPages }) =>
                  `Página ${pageNumber} de ${totalPages}`
                }
              />
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
