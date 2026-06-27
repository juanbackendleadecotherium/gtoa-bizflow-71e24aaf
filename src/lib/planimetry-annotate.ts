// Utilities for the planimetry annotation editor:
//   - rasterize an existing PDF (from a public/signed URL) into page images
//   - re-compose a new PDF from those flattened images
//   - upload the new PDF as a new `production_planimetries` version
import { supabase } from "@/integrations/supabase/client";

// pdfjs worker — bundled via vite (?url import)
import * as pdfjsLib from "pdfjs-dist";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — vite handles the ?url suffix
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** Render every page of a PDF (from a fetchable URL) into a canvas at the given DPI. */
export async function rasterizePdfPages(
  pdfUrl: string,
  dpi = 150,
): Promise<HTMLCanvasElement[]> {
  const res = await fetch(pdfUrl, { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo descargar el PDF original");
  const ab = await res.arrayBuffer();
  const loadingTask = (pdfjsLib as any).getDocument({ data: ab });
  const pdf = await loadingTask.promise;
  const canvases: HTMLCanvasElement[] = [];
  const scale = dpi / 72; // PDF point = 1/72 inch
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    canvases.push(canvas);
  }
  return canvases;
}

/** Convert a list of canvases into a single PDF Blob via @react-pdf/renderer. */
export async function canvasesToPdfBlob(canvases: HTMLCanvasElement[]): Promise<Blob> {
  const { pdf, Document, Page, Image, StyleSheet, View } = await import(
    "@react-pdf/renderer"
  );
  const styles = StyleSheet.create({
    page: { padding: 0, backgroundColor: "#ffffff" },
    wrap: { width: "100%", height: "100%", justifyContent: "center", alignItems: "center" },
    img: { width: "100%", height: "100%", objectFit: "contain" },
  });
  const images = canvases.map((c) => c.toDataURL("image/jpeg", 0.85));
  const doc = (
    <Document title="Planimetría anotada">
      {images.map((src, i) => (
        <Page key={i} size="LETTER" style={styles.page}>
          <View style={styles.wrap}>
            <Image src={src} style={styles.img} />
          </View>
        </Page>
      ))}
    </Document>
  );
  return await pdf(doc as any).toBlob();
}

/** Upload annotated PDF and insert a new version row, scoped to same item. */
export async function uploadAnnotatedPlanimetry(args: {
  productionOrderId: string;
  brandId: string;
  orderItemId: string | null;
  baseFileName: string;
  blob: Blob;
}) {
  // Resolve next version for this item
  const { data: existing, error: exErr } = await supabase
    .from("production_planimetries")
    .select("version, order_item_id")
    .eq("production_order_id", args.productionOrderId);
  if (exErr) throw exErr;
  const sameItem = (existing ?? []).filter(
    (r: any) => (r.order_item_id ?? null) === args.orderItemId,
  );
  const nextVersion =
    sameItem.reduce((m: number, r: any) => Math.max(m, r.version ?? 0), 0) + 1;

  const safeBase = args.baseFileName
    .replace(/\.pdf$/i, "")
    .replace(/-v\d+$/i, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileName = `${safeBase}-anotada-v${nextVersion}.pdf`;
  const path = `${args.brandId}/${args.productionOrderId}/${Date.now()}-annot-${fileName}`;

  const { error: upErr } = await supabase.storage
    .from("production-planimetries")
    .upload(path, args.blob, { contentType: "application/pdf", upsert: false });
  if (upErr) throw upErr;

  const { data: signed } = await supabase.storage
    .from("production-planimetries")
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  const { error: insErr } = await supabase.from("production_planimetries").insert({
    production_order_id: args.productionOrderId,
    brand_id: args.brandId,
    order_item_id: args.orderItemId,
    file_url: signed?.signedUrl ?? "",
    file_path: path,
    file_name: fileName,
    file_size: args.blob.size,
    mime_type: "application/pdf",
    version: nextVersion,
    notes: "Versión con anotaciones del vendedor",
  });
  if (insErr) throw insErr;
  return nextVersion;
}
