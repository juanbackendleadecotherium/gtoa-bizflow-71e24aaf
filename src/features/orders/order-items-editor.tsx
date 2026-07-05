import { useState } from "react";
import { Plus, Trash2, Pencil, Maximize2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

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
import {
  PlanimetryFilesUploader,
  type PendingPlanimetry,
} from "@/features/orders/planimetry-files-uploader";
import type { PlanimetryFile } from "@/lib/planimetry-upload";
import type { OrderItemInput } from "@/features/orders/schemas";

function parseDecimal(val: string) {
  const cleaned = val.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * El producto se guarda en la columna `description` como:
 *   `<título>\n\n<cuerpo opcional>`
 * Estas utilidades permiten editar título y cuerpo por separado en la UI
 * sin modificar el esquema de la base de datos.
 */
function splitTitleBody(raw: string): { title: string; body: string } {
  const text = raw ?? "";
  const idx = text.indexOf("\n");
  if (idx === -1) return { title: text, body: "" };
  const title = text.slice(0, idx);
  const body = text.slice(idx + 1).replace(/^\n+/, "");
  return { title, body };
}

function joinTitleBody(title: string, body: string): string {
  // No recortamos espacios aquí: si lo hacemos, el usuario no puede escribir
  // un espacio al final del título (se borra en cada pulsación y bloquea
  // escribir varias palabras). El trim final se hace al guardar.
  if (!title && !body) return "";
  if (!body) return title;
  if (!title) return `\n\n${body}`;
  return `${title}\n\n${body}`;
}

/** Editor de descripción larga en un modal amplio. */
function DescriptionDialog({
  open,
  onOpenChange,
  value,
  onSave,
  title,
  index,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: string;
  onSave: (v: string) => void;
  title: string;
  index: number;
}) {
  const [draft, setDraft] = useState(value);
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
          <DialogTitle>
            Descripción · {title || `Producto #${index + 1}`}
          </DialogTitle>
          <DialogDescription>
            Estas especificaciones se imprimen en la planimetría de producción. Usa saltos de línea
            para separar secciones (medidas, telas, acabados, etc.).
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

/** Preview compacto del cuerpo de la descripción + botón para abrir el modal. */
function DescriptionField({
  body,
  onChange,
  title,
  index,
}: {
  body: string;
  onChange: (v: string) => void;
  title: string;
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const isEmpty = !body.trim();
  const lineCount = body.split("\n").filter(Boolean).length;

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
            <span>Toca aquí para escribir la descripción (especificaciones)</span>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Descripción / especificaciones
              </p>
              <Maximize2 className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5 group-hover:text-accent transition-colors" />
            </div>
            <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-3 leading-snug">
              {body}
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
        value={body}
        onSave={onChange}
        title={title}
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
  existingPlanimetry,
  pendingPlanimetry,
  onExistingPlanimetryChange,
  onPendingPlanimetryChange,
}: {
  items: OrderItemInput[];
  onChange: (items: OrderItemInput[]) => void;
  existingImages?: string[][];
  pendingImages?: PendingImage[][];
  onExistingImagesChange?: (next: string[][]) => void;
  onPendingImagesChange?: (next: PendingImage[][]) => void;
  existingPlanimetry?: PlanimetryFile[][];
  pendingPlanimetry?: PendingPlanimetry[][];
  onExistingPlanimetryChange?: (next: PlanimetryFile[][]) => void;
  onPendingPlanimetryChange?: (next: PendingPlanimetry[][]) => void;
}) {
  const imagesEnabled =
    !!existingImages && !!pendingImages && !!onExistingImagesChange && !!onPendingImagesChange;
  const planimetryEnabled =
    !!existingPlanimetry &&
    !!pendingPlanimetry &&
    !!onExistingPlanimetryChange &&
    !!onPendingPlanimetryChange;

  const add = () => {
    onChange([...items, { description: "", quantity: 1, unit_price: 0, sort_order: items.length, is_standard_product: false }]);

    if (imagesEnabled) {
      onExistingImagesChange!([...(existingImages ?? []), []]);
      onPendingImagesChange!([...(pendingImages ?? []), []]);
    }
    if (planimetryEnabled) {
      onExistingPlanimetryChange!([...(existingPlanimetry ?? []), []]);
      onPendingPlanimetryChange!([...(pendingPlanimetry ?? []), []]);
    }
  };
  const remove = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
    if (imagesEnabled) {
      onExistingImagesChange!((existingImages ?? []).filter((_, i) => i !== idx));
      onPendingImagesChange!((pendingImages ?? []).filter((_, i) => i !== idx));
    }
    if (planimetryEnabled) {
      onExistingPlanimetryChange!((existingPlanimetry ?? []).filter((_, i) => i !== idx));
      onPendingPlanimetryChange!((pendingPlanimetry ?? []).filter((_, i) => i !== idx));
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
          const { title, body } = splitTitleBody(it.description);
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

              {/* Título del producto */}
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
                  Título del producto
                </Label>
                <Input
                  value={title}
                  onChange={(e) =>
                    update(idx, { description: joinTitleBody(e.target.value, body) })
                  }
                  placeholder="Ej. Sofá modular 3 puestos"
                  className="h-10"
                />
              </div>

              {/* Descripción / especificaciones */}
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
                  Descripción
                </Label>
                <DescriptionField
                  body={body}
                  onChange={(v) => update(idx, { description: joinTitleBody(title, v) })}
                  title={title}
                  index={idx}
                />
              </div>

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
                    Imágenes de referencia
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
                    hint="Imágenes que el cliente trajo o que sirven de referencia visual."
                  />
                </div>
              )}

              {planimetryEnabled && (() => {
                const ex = existingPlanimetry?.[idx] ?? [];
                const pe = pendingPlanimetry?.[idx] ?? [];
                const count = ex.length + pe.length;
                const missing = count === 0;
                return (
                  <div>
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        Planimetría del producto
                        {missing ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 normal-case tracking-normal text-[10px] font-semibold">
                            <AlertTriangle className="h-3 w-3" /> Pendiente
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 normal-case tracking-normal text-[10px] font-semibold">
                            ✓ {count} archivo{count === 1 ? "" : "s"}
                          </span>
                        )}
                      </Label>
                    </div>
                    <PlanimetryFilesUploader
                      existing={ex}
                      pending={pe}
                      onChangePending={(next) => {
                        const arr = (pendingPlanimetry ?? []).slice();
                        arr[idx] = next;
                        onPendingPlanimetryChange!(arr);
                      }}
                      onRemoveExisting={(url) => {
                        const arr = (existingPlanimetry ?? []).slice();
                        arr[idx] = (arr[idx] ?? []).filter((f) => f.url !== url);
                        onExistingPlanimetryChange!(arr);
                      }}
                      hint="Imagen o PDF con medidas, vistas y especificaciones técnicas. Obligatoria para enviar este producto a producción."
                    />
                  </div>
                );
              })()}

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
