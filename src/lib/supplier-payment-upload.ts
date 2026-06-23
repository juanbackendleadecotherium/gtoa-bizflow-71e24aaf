import { supabase } from "@/integrations/supabase/client";

const BUCKET = "supplier-payments";

function randomId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function sanitizeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 80);
}

/** Build the canonical path prefix for a supplier-payment receipt. */
export function supplierPaymentPathPrefix(brandId: string, orderId: string, orderItemId: string) {
  return `${brandId}/${orderId}/${orderItemId}`;
}

export type UploadedReceipt = {
  path: string;
  mime: string;
  size: number;
};

export async function uploadSupplierPaymentReceipt(
  file: File,
  brandId: string,
  orderId: string,
  orderItemId: string,
): Promise<UploadedReceipt> {
  const safe = sanitizeName(file.name || "comprobante");
  const path = `${supplierPaymentPathPrefix(brandId, orderId, orderItemId)}/${randomId()}-${safe}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  return {
    path,
    mime: file.type || "application/octet-stream",
    size: file.size,
  };
}

export async function getSupplierPaymentSignedUrl(path: string, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
