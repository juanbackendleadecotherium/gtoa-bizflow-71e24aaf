import { supabase } from "@/integrations/supabase/client";

const BUCKET = "order-attachments";

export type CompressOptions = {
  maxDimension?: number; // largest side, px
  quality?: number; // 0..1 for JPEG
  mimeType?: "image/jpeg" | "image/webp";
};

/**
 * Carga un archivo de imagen, lo decodifica, lo reescala manteniendo el aspect-ratio
 * y lo recomprime usando canvas para reducir el peso al máximo manteniendo legibilidad.
 */
export async function compressImage(
  file: File,
  opts: CompressOptions = {},
): Promise<Blob> {
  const maxDim = opts.maxDimension ?? 1600;
  const quality = opts.quality ?? 0.72;
  const mimeType = opts.mimeType ?? "image/jpeg";

  // Si ya es muy pequeña, no la toques
  if (file.size < 120 * 1024 && /image\/(jpe?g|webp)/.test(file.type)) {
    return file;
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    if (width >= height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise<Blob>((resolve) => {
    canvas.toBlob(
      (b) => resolve(b ?? file),
      mimeType,
      quality,
    );
  });
}

function randomId() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}

/** Comprime y sube una imagen al bucket público `order-attachments`. */
export async function uploadOrderImage(
  file: File,
  pathPrefix: string,
  opts?: CompressOptions,
): Promise<string> {
  const blob = await compressImage(file, opts);
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${pathPrefix.replace(/\/+$/, "")}/${randomId()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadOrderImages(
  files: File[],
  pathPrefix: string,
  opts?: CompressOptions,
): Promise<string[]> {
  const urls: string[] = [];
  for (const f of files) {
    urls.push(await uploadOrderImage(f, pathPrefix, opts));
  }
  return urls;
}
