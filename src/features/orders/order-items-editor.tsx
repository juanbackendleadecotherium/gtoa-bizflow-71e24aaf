import { useEffect, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/features/orders/money-input";
import { ImageUploader, type PendingImage } from "@/features/orders/image-uploader";
import type { OrderItemInput } from "@/features/orders/schemas";

function AutoTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <Textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="min-h-[40px] resize-none leading-snug overflow-hidden"
    />
  );
}



function parseDecimal(val: string) {
  const cleaned = val.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
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

      <div className="space-y-2">
        {items.map((it, idx) => {
          const lineTotal = Number(it.quantity || 0) * Number(it.unit_price || 0);
          return (
            <div
              key={idx}
              className="rounded-lg border border-border bg-background/40 p-3 space-y-3 sm:space-y-0 sm:grid sm:grid-cols-12 sm:gap-3 sm:items-start"
            >
              {/* Descripción */}
              <div className="sm:col-span-12 lg:col-span-6">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block sm:hidden lg:block">
                  Descripción
                </Label>
                <AutoTextarea
                  value={it.description}
                  onChange={(v) => update(idx, { description: v })}
                  placeholder="Ej. Sofá modular 3 puestos, tela nubuck color tabaco"
                />
              </div>

              {/* Cantidad */}
              <div className="grid grid-cols-2 gap-3 sm:contents">
                <div className="sm:col-span-2 lg:col-span-1">
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

                {/* Precio */}
                <div className="sm:col-span-4 lg:col-span-2">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
                    Precio
                  </Label>
                  <MoneyInput
                    className="text-right h-10"
                    value={Number(it.unit_price) || 0}
                    onValueChange={(n) => update(idx, { unit_price: n })}
                  />
                </div>
              </div>

              {/* Total + eliminar */}
              <div className="flex items-end justify-between gap-2 sm:col-span-6 lg:col-span-3">
                <div className="flex-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
                    Total
                  </Label>
                  <div className="h-10 flex items-center justify-end px-3 rounded-md bg-muted/40 text-sm font-medium tabular-nums">
                    {formatMoney(lineTotal)}
                  </div>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(idx)}
                  aria-label="Eliminar producto"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
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
