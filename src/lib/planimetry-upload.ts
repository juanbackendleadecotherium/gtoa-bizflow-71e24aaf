import { supabase } from "@/integrations/supabase/client";

const BUCKET = "order-attachments";

export type PlanimetryFile = {
  url: string;
  name: string;
  mime: string;
  size: number;
  uploaded_at: string;
};

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

/** Upload one planimetry file (image or PDF) without compression. */
export async function uploadPlanimetryFile(
  file: File,
  pathPrefix: string,
): Promise<PlanimetryFile> {
  const safeName = sanitizeName(file.name || "planimetria");
  const path = `${pathPrefix.replace(/\/+$/, "")}/${randomId()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return {
    url: data.publicUrl,
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    uploaded_at: new Date().toISOString(),
  };
}

export async function uploadPlanimetryFiles(
  files: File[],
  pathPrefix: string,
): Promise<PlanimetryFile[]> {
  const out: PlanimetryFile[] = [];
  for (const f of files) {
    out.push(await uploadPlanimetryFile(f, pathPrefix));
  }
  return out;
}
