import { useRef, useState, useEffect } from "react";
import { ImagePlus, X, Loader2, FileImage } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { compressImage } from "@/lib/image-upload";

export type PendingImage = {
  id: string;
  file: File;
  previewUrl: string;
  originalKb: number;
  compressedKb?: number;
};

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Componente reutilizable para seleccionar imágenes (1 o varias) con preview,
 * compresión en cliente y eliminación. NO sube nada: el padre conserva los File
 * en `pending` y los sube cuando guarda.
 *
 * Para imágenes ya subidas, se pasan en `existingUrls` y se gestionan aparte.
 */
export function ImageUploader({
  pending,
  onChangePending,
  existingUrls = [],
  onRemoveExisting,
  multiple = false,
  label = "Subir imagen",
  hint,
}: {
  pending: PendingImage[];
  onChangePending: (next: PendingImage[]) => void;
  existingUrls?: string[];
  onRemoveExisting?: (url: string) => void;
  multiple?: boolean;
  label?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);

  // Limpia object URLs al desmontar
  useEffect(() => {
    return () => {
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setProcessing(true);
    try {
      const newPending: PendingImage[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const blob = await compressImage(file);
        const compressed = new File(
          [blob],
          file.name.replace(/\.[^.]+$/, "") + (blob.type === "image/webp" ? ".webp" : ".jpg"),
          { type: blob.type },
        );
        newPending.push({
          id: makeId(),
          file: compressed,
          previewUrl: URL.createObjectURL(compressed),
          originalKb: Math.round(file.size / 1024),
          compressedKb: Math.round(compressed.size / 1024),
        });
      }
      const next = multiple ? [...pending, ...newPending] : newPending.slice(0, 1);
      // Si single y ya había uno, libera el viejo
      if (!multiple) pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      onChangePending(next);
    } finally {
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removePending = (id: string) => {
    const target = pending.find((p) => p.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onChangePending(pending.filter((p) => p.id !== id));
  };

  const all = [
    ...existingUrls.map((url) => ({ kind: "existing" as const, url })),
    ...pending.map((p) => ({ kind: "pending" as const, p })),
  ];

  const showPicker = multiple || all.length === 0;

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        capture="environment"
        className="hidden"
        onChange={(e) => handlePick(e.target.files)}
      />

      {all.length > 0 && (
        <div className={cn("grid gap-2", multiple ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-1")}>
          {all.map((item) =>
            item.kind === "existing" ? (
              <div
                key={item.url}
                className="relative group rounded-lg overflow-hidden border border-border bg-muted aspect-square"
              >
                <img src={item.url} alt="" className="w-full h-full object-cover" />
                {onRemoveExisting && (
                  <button
                    type="button"
                    onClick={() => onRemoveExisting(item.url)}
                    className="absolute top-1 right-1 h-6 w-6 grid place-items-center rounded-full bg-background/90 border border-border opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                    aria-label="Quitar imagen"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <div
                key={item.p.id}
                className="relative group rounded-lg overflow-hidden border border-accent/40 bg-muted aspect-square"
              >
                <img src={item.p.previewUrl} alt="" className="w-full h-full object-cover" />
                <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 text-[9px] bg-background/85 text-muted-foreground flex items-center justify-between gap-1">
                  <span className="flex items-center gap-1 truncate">
                    <FileImage className="h-3 w-3 shrink-0" />
                    <span className="truncate">{item.p.compressedKb}KB</span>
                  </span>
                  {item.p.originalKb > (item.p.compressedKb ?? 0) && (
                    <span className="text-accent">
                      −{Math.max(0, Math.round((1 - (item.p.compressedKb ?? 0) / item.p.originalKb) * 100))}%
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removePending(item.p.id)}
                  className="absolute top-1 right-1 h-6 w-6 grid place-items-center rounded-full bg-background/90 border border-border opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                  aria-label="Quitar imagen"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ),
          )}

          {showPicker && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={processing}
              className="aspect-square rounded-lg border border-dashed border-border hover:border-accent/60 hover:bg-accent/[0.04] transition-colors grid place-items-center text-muted-foreground gap-1 text-[10px]"
            >
              {processing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <ImagePlus className="h-5 w-5" />
                  <span>Agregar</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {all.length === 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={processing}
          className="gap-2 w-full justify-center border-dashed h-20"
        >
          {processing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <ImagePlus className="h-4 w-4" />
              {label}
            </>
          )}
        </Button>
      )}

      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
