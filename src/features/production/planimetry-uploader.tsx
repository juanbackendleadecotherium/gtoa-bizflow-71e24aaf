import { useRef, useState } from "react";
import { Upload, Loader2, Trash2, FileText, Download, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PlanimetryAnnotatorDialog } from "./planimetry-annotator";


export type Planimetry = {
  id: string;
  file_name: string;
  file_path: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  version: number;
  notes: string | null;
  uploaded_at: string;
  uploaded_by_email: string | null;
  order_item_id?: string | null;
  order_item?: { id: string; description: string | null } | null;
};

function itemTitle(p: Planimetry): string {
  const desc = p.order_item?.description ?? "";
  const first = desc.split(/\n/)[0]?.trim();
  return first || "Sin producto vinculado";
}

export function PlanimetryUploader({
  productionOrderId,
  brandId,
  items,
  canDelete,
  onChange,
  readOnly = false,
}: {
  productionOrderId: string;
  brandId: string;
  items: Planimetry[];
  canDelete: boolean;
  onChange: () => void;
  /** Modo sólo lectura: oculta subir/reemplazar/anotar/borrar. */
  readOnly?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState("");
  const [annotating, setAnnotating] = useState<Planimetry | null>(null);


  const nextVersion = (items.reduce((m, i) => Math.max(m, i.version), 0) || 0) + 1;

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${brandId}/${productionOrderId}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("production-planimetries")
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) throw upErr;
        const { data: signed } = await supabase.storage
          .from("production-planimetries").createSignedUrl(path, 60 * 60 * 24 * 7);
        const { error: insErr } = await supabase.from("production_planimetries").insert({
          production_order_id: productionOrderId,
          brand_id: brandId,
          file_url: signed?.signedUrl ?? "",
          file_path: path,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || null,
          version: nextVersion,
          notes: note || null,
        });
        if (insErr) throw insErr;
      }
      toast.success("Planimetría subida");
      setNote("");
      onChange();
    } catch (e: any) {
      toast.error(e.message ?? "Error al subir");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDownload = async (p: Planimetry) => {
    const { data, error } = await supabase.storage
      .from("production-planimetries").createSignedUrl(p.file_path, 60 * 5);
    if (error || !data?.signedUrl) { toast.error("No se pudo generar enlace"); return; }
    window.open(data.signedUrl, "_blank");
  };

  const handleDelete = async (p: Planimetry) => {
    if (!confirm(`¿Eliminar ${p.file_name}?`)) return;
    await supabase.storage.from("production-planimetries").remove([p.file_path]);
    const { error } = await supabase.from("production_planimetries").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Eliminada");
    onChange();
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-dashed border-border p-3 bg-muted/30">
        <Input
          placeholder="Nota opcional (ej: versión final aprobada)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mb-2 bg-background"
        />
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.dwg,.dxf,.svg,image/*,application/pdf"
          onChange={(e) => handleUpload(e.target.files)}
        />
        <Button
          type="button" size="sm" variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full gap-2 border-dashed"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Subir planimetría (PDF, imagen, DWG…) — versión {nextVersion}
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3 text-center">Sin planimetrías aún.</p>
      ) : (
        (() => {
          // Group by order item so multi-product orders show one block per product.
          const groups = new Map<string, Planimetry[]>();
          for (const p of items) {
            const key = p.order_item_id ?? "__legacy__";
            const arr = groups.get(key) ?? [];
            arr.push(p);
            groups.set(key, arr);
          }
          return (
            <div className="space-y-4">
              {Array.from(groups.entries()).map(([key, list]) => (
                <div key={key} className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                    {key === "__legacy__" ? "Planimetrías generales" : itemTitle(list[0])}
                  </p>
                  <ul className="space-y-2">
                    {list.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 rounded-lg border border-border p-3 bg-background">
                        <div className="h-10 w-10 rounded-md bg-muted grid place-items-center shrink-0">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{p.file_name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            v{p.version} · {p.file_size ? `${Math.round(p.file_size / 1024)} KB · ` : ""}
                            {new Date(p.uploaded_at).toLocaleDateString("es-CO")}
                            {p.uploaded_by_email && ` · ${p.uploaded_by_email}`}
                          </p>
                          {p.notes && <p className="text-xs text-muted-foreground italic mt-0.5 truncate">{p.notes}</p>}
                        </div>
                        {p.mime_type === "application/pdf" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setAnnotating(p)}
                            title="Anotar planimetría"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => handleDownload(p)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        {canDelete && (
                          <Button size="icon" variant="ghost" onClick={() => handleDelete(p)} className="text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}

                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          );
        })()
      )}

      {annotating && (
        <PlanimetryAnnotatorDialog
          open={!!annotating}
          onOpenChange={(o) => !o && setAnnotating(null)}
          pdfUrl={annotating.file_url}
          baseFileName={annotating.file_name}
          productionOrderId={productionOrderId}
          brandId={brandId}
          orderItemId={annotating.order_item_id ?? null}
          onSaved={() => {
            setAnnotating(null);
            onChange();
          }}
        />
      )}
    </div>
  );

}
