import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OrderItemInput } from "@/features/orders/schemas";

export function OrderItemsEditor({
  items,
  onChange,
}: {
  items: OrderItemInput[];
  onChange: (items: OrderItemInput[]) => void;
}) {
  const add = () => onChange([...items, { description: "", quantity: 1, unit_price: 0, sort_order: items.length }]);
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const update = (idx: number, patch: Partial<OrderItemInput>) =>
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const subtotal = items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Descripción</th>
              <th className="text-right px-3 py-2 w-24">Cant.</th>
              <th className="text-right px-3 py-2 w-32">Precio</th>
              <th className="text-right px-3 py-2 w-32">Total</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={5} className="text-center py-6 text-muted-foreground text-xs">Agrega items al pedido</td></tr>
            )}
            {items.map((it, idx) => (
              <tr key={idx} className="border-t border-border">
                <td className="px-2 py-1.5">
                  <Input value={it.description} onChange={(e) => update(idx, { description: e.target.value })} placeholder="Descripción del item" />
                </td>
                <td className="px-2 py-1.5">
                  <Input type="number" step="0.01" min="0" className="text-right" value={it.quantity} onChange={(e) => update(idx, { quantity: Number(e.target.value) })} />
                </td>
                <td className="px-2 py-1.5">
                  <Input type="number" step="0.01" min="0" className="text-right" value={it.unit_price} onChange={(e) => update(idx, { unit_price: Number(e.target.value) })} />
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {(Number(it.quantity || 0) * Number(it.unit_price || 0)).toFixed(2)}
                </td>
                <td className="px-2 py-1.5">
                  <Button type="button" size="icon" variant="ghost" onClick={() => remove(idx)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/20">
              <td colSpan={3} className="px-3 py-2 text-right text-xs uppercase tracking-wider text-muted-foreground">Subtotal</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{subtotal.toFixed(2)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={add} className="gap-2">
        <Plus className="h-3.5 w-3.5" /> Agregar item
      </Button>
    </div>
  );
}

export function formatMoney(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
