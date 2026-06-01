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

const INK = "#0f172a";
const SUB = "#475569";
const MUTED = "#94a3b8";
const LINE = "#e2e8f0";
const SOFT = "#f8fafc";

const styles = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 60, paddingHorizontal: 0, fontSize: 10, color: INK, fontFamily: "Helvetica" },
  accent: { height: 6, width: "100%" },

  headerWrap: { paddingHorizontal: 36, paddingTop: 24, paddingBottom: 14 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brandCol: { maxWidth: "60%" },
  logoBox: { width: 130, height: 50, marginBottom: 8, justifyContent: "center" },
  logo: { maxWidth: 130, maxHeight: 48, objectFit: "contain" },
  brandName: { fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: INK },

  metaCol: { alignItems: "flex-end" },
  metaTag: { fontSize: 8, color: MUTED, letterSpacing: 1.5, fontWeight: 700, textTransform: "uppercase" },
  factTag: { fontSize: 8, color: MUTED, letterSpacing: 1.2, fontWeight: 700, marginTop: 8, textTransform: "uppercase" },
  factNumber: { fontSize: 22, fontWeight: 700, color: INK, lineHeight: 1 },
  prodCode: { fontSize: 10, color: SUB, marginTop: 2, fontFamily: "Helvetica" },

  title: {
    marginHorizontal: 36, marginTop: 4, marginBottom: 12,
    fontSize: 16, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase",
  },

  infoCard: {
    marginHorizontal: 36, padding: 12, borderRadius: 6, borderWidth: 0.5,
    borderColor: LINE, backgroundColor: SOFT, marginBottom: 14,
  },
  infoGrid: { flexDirection: "row", flexWrap: "wrap" },
  infoCell: { width: "33.333%", paddingVertical: 4, paddingRight: 8 },
  infoLabel: { fontSize: 7.5, color: MUTED, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase", marginBottom: 2 },
  infoValue: { fontSize: 10, color: INK, fontWeight: 700 },

  itemBlock: { marginHorizontal: 36, marginBottom: 14, borderWidth: 0.5, borderColor: LINE, borderRadius: 6 },
  itemHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: LINE,
    backgroundColor: SOFT, borderTopLeftRadius: 6, borderTopRightRadius: 6,
  },
  itemIdx: { fontSize: 8, color: MUTED, letterSpacing: 1, fontWeight: 700 },
  itemQty: {
    fontSize: 9, fontWeight: 700, color: INK,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 0.5, borderColor: LINE,
    backgroundColor: "#ffffff",
  },
  itemBody: { padding: 12 },
  itemTitle: { fontSize: 12, fontWeight: 700, color: INK, marginBottom: 4 },
  itemDesc: { fontSize: 9.5, color: SUB, lineHeight: 1.5 },

  imageGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, marginHorizontal: -3 },
  imageCell: { width: "33.333%", padding: 3 },
  imageBox: {
    width: "100%", height: 130, borderRadius: 4, borderWidth: 0.5, borderColor: LINE,
    backgroundColor: "#ffffff", overflow: "hidden",
  },
  imageEl: { width: "100%", height: "100%", objectFit: "cover" },
  imageCaption: { fontSize: 7.5, color: MUTED, marginTop: 3, textAlign: "center" },
  noImages: {
    marginTop: 8, paddingVertical: 14, borderRadius: 4, borderWidth: 0.5, borderStyle: "dashed",
    borderColor: LINE, textAlign: "center", fontSize: 8.5, color: MUTED,
  },

  notesBlock: {
    marginHorizontal: 36, marginTop: 4, padding: 12, borderRadius: 6,
    borderLeftWidth: 3, backgroundColor: SOFT,
  },
  notesLabel: { fontSize: 7.5, color: MUTED, letterSpacing: 1.2, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 },
  notesBody: { fontSize: 10, color: INK, lineHeight: 1.5 },

  footerBlock: {
    position: "absolute", bottom: 24, left: 36, right: 36,
    paddingTop: 6, borderTopWidth: 0.5, borderTopColor: LINE,
    flexDirection: "row", justifyContent: "space-between",
  },
  footerText: { fontSize: 8, color: SUB },
});

const fmtDate = (s?: string | null) => {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
  } catch { return s; }
};

export function PlanimetryDocument({ data }: { data: PlanimetryDocumentData }) {
  const logo = getBrandLogo(data.brand.slug, data.brand.logo_url);
  const accent = (data.brand.primary_color && /^#[0-9a-f]{3,8}$/i.test(data.brand.primary_color))
    ? data.brand.primary_color : "#0f172a";

  return (
    <Document title={`Planimetría ${data.production_code}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={[styles.accent, { backgroundColor: accent }]} fixed />

        {/* Header */}
        <View style={styles.headerWrap}>
          <View style={styles.headerRow}>
            <View style={styles.brandCol}>
              <View style={styles.logoBox}>
                {logo ? (
                  <Image src={logo} style={styles.logo} />
                ) : (
                  <Text style={{ fontSize: 16, fontWeight: 700, color: accent }}>{data.brand.name}</Text>
                )}
              </View>
              <Text style={styles.brandName}>{(data.brand.legal_name || data.brand.name).toUpperCase()}</Text>
            </View>
            <View style={styles.metaCol}>
              <Text style={styles.metaTag}>Orden de producción</Text>
              <Text style={styles.prodCode}>{data.production_code}</Text>
              {data.invoice_number ? (
                <>
                  <Text style={styles.factTag}>Nro Factura</Text>
                  <Text style={[styles.factNumber, { color: accent }]}>{data.invoice_number}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.factTag}>Pedido</Text>
                  <Text style={[styles.factNumber, { color: accent }]}>{data.order_number}</Text>
                </>
              )}
            </View>
          </View>
        </View>

        <Text style={[styles.title, { color: accent }]}>Ficha técnica de producción</Text>

        {/* Info card */}
        <View style={styles.infoCard}>
          <View style={styles.infoGrid}>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Cliente</Text>
              <Text style={styles.infoValue}>{data.customer_name}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Fecha</Text>
              <Text style={styles.infoValue}>{fmtDate(data.sale_date ?? new Date().toISOString())}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Comercial</Text>
              <Text style={styles.infoValue}>{data.seller_name || "—"}</Text>
            </View>
            {data.customer_phone ? (
              <View style={styles.infoCell}>
                <Text style={styles.infoLabel}>Teléfono</Text>
                <Text style={styles.infoValue}>{data.customer_phone}</Text>
              </View>
            ) : null}
            {data.customer_city ? (
              <View style={styles.infoCell}>
                <Text style={styles.infoLabel}>Ciudad</Text>
                <Text style={styles.infoValue}>{data.customer_city}</Text>
              </View>
            ) : null}
            {data.estimated_delivery_date ? (
              <View style={styles.infoCell}>
                <Text style={styles.infoLabel}>Fecha de entrega</Text>
                <Text style={[styles.infoValue, { color: accent }]}>{fmtDate(data.estimated_delivery_date)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Items */}
        {data.items.map((it, i) => {
          const lines = it.description.split(/\n+/);
          const title = lines[0] || `Producto ${i + 1}`;
          const detail = lines.slice(1).join("\n");
          return (
            <View key={i} style={styles.itemBlock} wrap={true}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemIdx}>PRODUCTO {String(i + 1).padStart(2, "0")}</Text>
                <Text style={styles.itemQty}>Cantidad · {Number(it.quantity)}</Text>
              </View>
              <View style={styles.itemBody}>
                <Text style={styles.itemTitle}>{title}</Text>
                {detail ? <Text style={styles.itemDesc}>{detail}</Text> : null}

                {it.images.length > 0 ? (
                  <View style={styles.imageGrid}>
                    {it.images.map((url, idx) => (
                      <View key={idx} style={styles.imageCell} wrap={false}>
                        <View style={styles.imageBox}>
                          <Image src={url} style={styles.imageEl} />
                        </View>
                        <Text style={styles.imageCaption}>Referencia {idx + 1}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.noImages}>Sin imágenes de referencia adjuntas</Text>
                )}
              </View>
            </View>
          );
        })}

        {/* Notes */}
        {data.notes ? (
          <View style={[styles.notesBlock, { borderLeftColor: accent }]}>
            <Text style={styles.notesLabel}>Notas de la venta</Text>
            <Text style={styles.notesBody}>{data.notes}</Text>
          </View>
        ) : null}

        <View style={styles.footerBlock} fixed>
          <Text style={styles.footerText}>
            {data.brand.legal_name || data.brand.name} · Planimetría {data.production_code}
          </Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
