import { useState } from "react";
import { Plus, Trash2, Pencil, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { MoneyInput } from "@/features/orders/money-input";
import { ImageUploader, type PendingImage } from "@/features/orders/image-uploader";
import type { OrderItemInput } from "@/features/orders/schemas";

function parseDecimal(val: string) {
  const cleaned = val.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/** Editor de descripción en un modal amplio para descripciones largas. */
function DescriptionDialog({
  open,
  onOpenChange,
  value,
  onSave,
  index,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: string;
  onSave: (v: string) => void;
  index: number;
}) {
  const [draft, setDraft] = useState(value);
  // Re-sincroniza cuando se abre con un valor distinto
  if (open && draft !== value && draft === "") setDraft(value);

  const lines = draft.split("\n").length;
  const chars = draft.length;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) setDraft(value);
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Descripción del producto #{index + 1}</DialogTitle>
          <DialogDescription>
            Estas especificaciones se imprimen tal cual en la planimetría de producción. Usa saltos
            de línea para separar secciones (medidas, telas, acabados, etc.).
          </DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            "Ej.\nMedidas Generales: 2.80 × .160\nASIENTO: Altura 40 cm\nTipo de tela: Pendiente por definir\nAcabados: ..."
          }
          className="min-h-[420px] font-mono text-sm leading-relaxed"
        />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {lines} línea{lines === 1 ? "" : "s"} · {chars} caracteres
          </span>
          <span className="hidden sm:inline">
            Tip: presiona ⌘/Ctrl + Enter para guardar
          </span>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => {
              onSave(draft);
              onOpenChange(false);
            }}
          >
            Guardar descripción
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Vista compacta de la descripción con preview clampeado + botón para expandir. */
function DescriptionField({
  value,
  onChange,
  index,
}: {
  value: string;
  onChange: (v: string) => void;
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const isEmpty = !value.trim();
  const lineCount = value.split("\n").filter(Boolean).length;
  const firstLine = value.split("\n").find((l) => l.trim()) ?? "";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group w-full text-left rounded-md border border-border bg-background/60 hover:border-accent/50 hover:bg-accent/[0.03] transition-colors p-3 space-y-1"
      >
        {isEmpty ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Pencil className="h-3.5 w-3.5" />
            <span>Toca aquí para escribir la descripción del producto</span>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-foreground line-clamp-1">
                {firstLine || "Producto sin título"}
              </p>
              <Maximize2 className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5 group-hover:text-accent transition-colors" />
            </div>
            <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-3 leading-snug">
              {value}
            </p>
            <div className="flex items-center gap-2 pt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/80">
              <span>
                {lineCount} línea{lineCount === 1 ? "" : "s"}
              </span>
              <span>·</span>
              <span className="text-accent group-hover:underline">Editar especificaciones</span>
            </div>
          </>
        )}
      </button>
      <DescriptionDialog
        open={open}
        onOpenChange={setOpen}
        value={value}
        onSave={onChange}
        index={index}
      />
    </>
  );
}

export function OrderItemsEditor({
  items,
  onChange,
  existingImages,
  pendingImages,
  onExistingImagesChange,
  onPendingImagesChange,
}: {
  items: OrderItemInput[];
  onChange: (items: OrderItemInput[]) => void;
  existingImages?: string[][];
  pendingImages?: PendingImage[][];
  onExistingImagesChange?: (next: string[][]) => void;
  onPendingImagesChange?: (next: PendingImage[][]) => void;
}) {
  const imagesEnabled =
    !!existingImages && !!pendingImages && !!onExistingImagesChange && !!onPendingImagesChange;

  const add = () => {
    onChange([...items, { description: "", quantity: 1, unit_price: 0, sort_order: items.length }]);
    if (imagesEnabled) {
      onExistingImagesChange!([...(existingImages ?? []), []]);
      onPendingImagesChange!([...(pendingImages ?? []), []]);
    }
  };
  const remove = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
    if (imagesEnabled) {
      onExistingImagesChange!((existingImages ?? []).filter((_, i) => i !== idx));
      onPendingImagesChange!((pendingImages ?? []).filter((_, i) => i !== idx));
    }
  };
  const update = (idx: number, patch: Partial<OrderItemInput>) =>
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const subtotal = items.reduce(
    (s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0),
    0,
  );

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <div className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
          Aún no has agregado productos.
        </div>
      )}

      <div className="space-y-3">
        {items.map((it, idx) => {
          const lineTotal = Number(it.quantity || 0) * Number(it.unit_price || 0);
          return (
            <div
              key={idx}
              className="rounded-lg border border-border bg-background/40 p-3 space-y-3"
            >
              {/* Encabezado: número + eliminar */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Producto #{idx + 1}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(idx)}
                  aria-label="Eliminar producto"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Descripción compacta con dialog */}
              <DescriptionField
                value={it.description}
                onChange={(v) => update(idx, { description: v })}
                index={idx}
              />

              {/* Fila numérica: cantidad / precio / total */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
                    Cant.
                  </Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    className="text-right h-10"
                    value={it.quantity === 0 ? "" : String(it.quantity)}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        update(idx, { quantity: 0 });
                        return;
                      }
                      const num = parseDecimal(val);
                      if (num !== null) update(idx, { quantity: num });
                    }}
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
                    Precio
                  </Label>
                  <MoneyInput
                    className="text-right h-10"
                    value={Number(it.unit_price) || 0}
                    onValueChange={(n) => update(idx, { unit_price: n })}
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
                    Total
                  </Label>
                  <div className="h-10 flex items-center justify-end px-3 rounded-md bg-muted/40 text-sm font-medium tabular-nums">
                    {formatMoney(lineTotal)}
                  </div>
                </div>
              </div>

              {imagesEnabled && (
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">
                    Imágenes de referencia · planimetría
                  </Label>
                  <ImageUploader
                    multiple
                    pending={pendingImages?.[idx] ?? []}
                    onChangePending={(next) => {
                      const arr = (pendingImages ?? []).slice();
                      arr[idx] = next;
                      onPendingImagesChange!(arr);
                    }}
                    existingUrls={existingImages?.[idx] ?? []}
                    onRemoveExisting={(url) => {
                      const arr = (existingImages ?? []).slice();
                      arr[idx] = (arr[idx] ?? []).filter((u) => u !== url);
                      onExistingImagesChange!(arr);
                    }}
                    hint="Se usarán al enviar a producción para construir la planimetría. Clic en una miniatura para verla en tamaño original."
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between pt-1">
        <Button type="button" variant="outline" size="sm" onClick={add} className="gap-2 self-start">
          <Plus className="h-3.5 w-3.5" /> Agregar producto
        </Button>
        <div className="flex items-baseline gap-2 sm:gap-3 justify-end">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Subtotal
          </span>
          <span className="font-display text-lg font-semibold tabular-nums">
            {formatMoney(subtotal)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function formatMoney(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}
