import { useRef, useState, useEffect, useCallback } from "react";
import { FileUp, Loader2, X, FileText, ImageIcon, ClipboardPaste } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanimetryFile } from "@/lib/planimetry-upload";

export type PendingPlanimetry = {
  id: string;
  file: File;
  previewUrl: string;
  isImage: boolean;
  isPdf: boolean;
};

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

function isImageMime(m: string) {
  return /^image\//i.test(m);
}
function isPdfMime(m: string) {
  return /pdf/i.test(m);
}

/**
 * Uploader específico para planimetrías. Acepta imágenes y PDF.
 * Soporta clic, arrastrar y pegar (Ctrl/Cmd+V).
 */
export function PlanimetryFilesUploader({
  existing,
  pending,
  onChangePending,
  onRemoveExisting,
  hint,
}: {
  existing: PlanimetryFile[];
  pending: PendingPlanimetry[];
  onChangePending: (next: PendingPlanimetry[]) => void;
  onRemoveExisting: (url: string) => void;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [justPasted, setJustPasted] = useState(false);

  const ingestFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setBusy(true);
      setError(null);
      try {
        const accepted: PendingPlanimetry[] = [];
        for (const file of files) {
          const isImage = isImageMime(file.type);
          const isPdf = isPdfMime(file.type);
          if (!isImage && !isPdf) {
            setError("Solo imágenes o PDF.");
            continue;
          }
          if (file.size > MAX_SIZE) {
            setError(`"${file.name}" supera 10 MB.`);
            continue;
          }
          accepted.push({
            id: makeId(),
            file,
            previewUrl: URL.createObjectURL(file),
            isImage,
            isPdf,
          });
        }
        if (accepted.length) onChangePending([...pending, ...accepted]);
      } finally {
        setBusy(false);
      }
    },
    [pending, onChangePending],
  );

  const handlePick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    await ingestFiles(Array.from(files));
    if (inputRef.current) inputRef.current.value = "";
  };

  // Pegar archivos desde el portapapeles (Ctrl/Cmd+V) cuando el área tiene foco/hover
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
          if (f && (isImageMime(f.type) || isPdfMime(f.type))) files.push(f);
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
    const t = pending.find((p) => p.id === id);
    if (t) URL.revokeObjectURL(t.previewUrl);
    onChangePending(pending.filter((p) => p.id !== id));
  };

  const total = existing.length + pending.length;
  const isEmpty = total === 0;

  return (
    <div
      ref={dropZoneRef}
      tabIndex={-1}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "space-y-2 rounded-lg outline-none transition-colors",
        isDragging && "ring-2 ring-amber-500/60 ring-offset-2 ring-offset-background bg-amber-500/[0.06]",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => handlePick(e.target.files)}
      />

      {isEmpty ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={cn(
            "w-full rounded-lg border-2 border-dashed border-amber-500/40 bg-amber-500/[0.04]",
            "hover:border-amber-500/70 hover:bg-amber-500/[0.07] transition-colors",
            "px-4 py-5 flex flex-col items-center justify-center gap-1.5 text-amber-700 dark:text-amber-300",
            isDragging && "border-amber-500 bg-amber-500/[0.08]",
          )}
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <FileUp className="h-5 w-5" />
              <span className="text-sm font-medium">Subir planimetría</span>
              <span className="text-[10px]">
                Imagen o PDF · obligatoria para enviar a producción
              </span>
            </>
          )}
        </button>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {existing.map((f) => (
            <PlanimetryTile
              key={f.url}
              url={f.url}
              name={f.name}
              isImage={isImageMime(f.mime)}
              isPdf={isPdfMime(f.mime)}
              onRemove={() => onRemoveExisting(f.url)}
            />
          ))}
          {pending.map((p) => (
            <PlanimetryTile
              key={p.id}
              url={p.previewUrl}
              name={p.file.name}
              isImage={p.isImage}
              isPdf={p.isPdf}
              isPending
              onRemove={() => removePending(p.id)}
            />
          ))}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-amber-500/60 hover:bg-amber-500/[0.04] transition-colors grid place-items-center text-muted-foreground gap-1 text-[10px]"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <FileUp className="h-5 w-5" />
                <span>Agregar</span>
              </>
            )}
          </button>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        <span>Puedes arrastrar más archivos aquí o pegarlos con Ctrl/Cmd+V</span>
        {justPasted && <span className="text-amber-600 dark:text-amber-300 font-medium">· Pegado ✓</span>}
      </p>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PlanimetryTile({
  url,
  name,
  isImage,
  isPdf,
  isPending,
  onRemove,
}: {
  url: string;
  name: string;
  isImage: boolean;
  isPdf: boolean;
  isPending?: boolean;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "relative group rounded-lg overflow-hidden border bg-muted/40 aspect-square",
        isPending ? "border-accent/40" : "border-border",
      )}
    >
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block w-full h-full"
        title={name}
      >
        {isImage ? (
          <img src={url} alt={name} className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2 text-center">
            {isPdf ? (
              <FileText className="h-8 w-8 text-red-600 dark:text-red-400" />
            ) : (
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            )}
            <span className="text-[10px] text-muted-foreground line-clamp-2 break-all">
              {name}
            </span>
            {isPdf && (
              <span className="text-[9px] uppercase tracking-wider text-red-700 dark:text-red-300 font-semibold">
                PDF
              </span>
            )}
          </div>
        )}
      </a>
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1 right-1 h-6 w-6 grid place-items-center rounded-full bg-background/90 border border-border opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
        aria-label="Quitar planimetría"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {isPending && (
        <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-accent/90 text-[9px] uppercase tracking-wider text-white text-center font-medium">
          Sin guardar
        </div>
      )}
    </div>
  );
}
