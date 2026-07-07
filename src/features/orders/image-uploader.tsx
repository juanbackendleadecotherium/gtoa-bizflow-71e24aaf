import { useRef, useState, useEffect, useCallback } from "react";
import { ImagePlus, X, Loader2, FileImage, ClipboardPaste } from "lucide-react";
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
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const pasteZoneRef = useRef<HTMLButtonElement>(null);
  const [processing, setProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [justPasted, setJustPasted] = useState(false);
  const [pasteFocused, setPasteFocused] = useState(false);
  useEffect(() => {
    return () => {
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ingestFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) return;
      setProcessing(true);
      try {
        const newPending: PendingImage[] = [];
        for (const file of images) {
          const blob = await compressImage(file);
          const baseName = (file.name || "imagen").replace(/\.[^.]+$/, "");
          const compressed = new File(
            [blob],
            baseName + (blob.type === "image/webp" ? ".webp" : ".jpg"),
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
        if (!multiple) pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
        onChangePending(next);
      } finally {
        setProcessing(false);
      }
    },
    [multiple, pending, onChangePending],
  );

  const handlePick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    await ingestFiles(Array.from(files));
    if (inputRef.current) inputRef.current.value = "";
  };

  // Pegar imagen desde el portapapeles (Ctrl/Cmd+V) cuando el área tiene foco/hover
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const node = dropZoneRef.current;
      if (!node) return;
      const active = document.activeElement;
      const focusedInside = active && node.contains(active);
      const hovered = node.matches(":hover");
      if (!focusedInside && !hovered) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const it of Array.from(items)) {
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f && f.type.startsWith("image/")) files.push(f);
        }
      }
      if (files.length === 0) return;
      e.preventDefault();
      await ingestFiles(files);
      setJustPasted(true);
      window.setTimeout(() => setJustPasted(false), 1200);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [ingestFiles]);

  const onDragOver = (e: React.DragEvent) => {
    if (Array.from(e.dataTransfer.types).includes("Files")) {
      e.preventDefault();
      setIsDragging(true);
    }
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setIsDragging(false);
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) await ingestFiles(files);
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
    <div
      ref={dropZoneRef}
      tabIndex={-1}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "space-y-2 rounded-lg outline-none transition-colors",
        isDragging && "ring-2 ring-accent/60 ring-offset-2 ring-offset-background bg-accent/[0.04]",
      )}
    >
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
                className="relative group rounded-lg overflow-hidden border border-border bg-muted/40 aspect-square"
              >
                <a href={item.url} target="_blank" rel="noreferrer" className="block w-full h-full">
                  <img src={item.url} alt="" className="w-full h-full object-contain" />
                </a>
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
                className="relative group rounded-lg overflow-hidden border border-accent/40 bg-muted/40 aspect-square"
              >
                <a href={item.p.previewUrl} target="_blank" rel="noreferrer" className="block w-full h-full">
                  <img src={item.p.previewUrl} alt="" className="w-full h-full object-contain" />
                </a>
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
        <div className="space-y-1.5">
          <button
            ref={pasteZoneRef}
            type="button"
            onClick={() => pasteZoneRef.current?.focus()}
            onFocus={() => setPasteFocused(true)}
            onBlur={() => setPasteFocused(false)}
            disabled={processing}
            aria-label="Área para pegar imagen con Ctrl+V"
            className={cn(
              "w-full rounded-lg border-2 border-dashed border-border bg-background/40 transition-colors px-4 py-5 flex flex-col items-center justify-center gap-1.5 text-muted-foreground outline-none",
              "hover:border-accent/60 hover:bg-accent/[0.04]",
              "focus-visible:border-accent focus-visible:bg-accent/[0.08] focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-accent/40",
              isDragging && "border-accent bg-accent/[0.06] text-foreground",
              pasteFocused && "border-accent bg-accent/[0.08] text-foreground",
            )}
          >
            {processing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <ClipboardPaste className="h-5 w-5" />
                <span className="text-sm font-medium">
                  {isDragging
                    ? "Suelta para subir"
                    : pasteFocused
                      ? "Ahora pega con Ctrl/Cmd+V"
                      : "Haz clic aquí y pega con Ctrl+V"}
                </span>
                <span className="text-[10px]">También puedes arrastrar una imagen</span>
              </>
            )}
          </button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={processing}
            className="w-full gap-2"
          >
            <ImagePlus className="h-4 w-4" />
            {label}
          </Button>
        </div>
      )}

      {all.length > 0 && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <ClipboardPaste className="h-3 w-3" />
          {justPasted
            ? "Imagen pegada"
            : "Puedes arrastrar más imágenes aquí o pegarlas con Ctrl/Cmd+V"}
        </p>
      )}

      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
