import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MarginPill } from "./margin-pill";

type Item = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  manufacturing_cost: number | null;
  margin_pct: number | null;
  supplier_id: string | null;
  cost_notes: string | null;
};

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

function firstLine(s: string) {
  const idx = s.indexOf("\n");
  return idx === -1 ? s : s.slice(0, idx);
}

export function ItemMarginsSection({
  productionOrderId,
  orderId,
  brandId,
}: {
  productionOrderId: string;
  orderId: string;
  brandId: string;
}) {
  const qc = useQueryClient();

  const settings = useQuery({
    queryKey: ["brand-production-settings", brandId],
    queryFn: async () => {
      const { data } = await supabase
        .from("brand_production_settings")
        .select("min_margin_pct")
        .eq("brand_id", brandId)
        .maybeSingle();
      return data ?? { min_margin_pct: 45 };
    },
  });

  const suppliers = useQuery({
    queryKey: ["suppliers-list", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("brand_id", brandId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const items = useQuery({
    queryKey: ["production-order-items", productionOrderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, description, quantity, unit_price, line_total, manufacturing_cost, margin_pct, supplier_id, cost_notes, sort_order")
        .eq("production_order_id", productionOrderId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });

  const min = Number(settings.data?.min_margin_pct ?? 45);

  return (
    <section className="rounded-xl border border-border bg-surface p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">Productos y márgenes</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Margen mínimo requerido: <span className="font-semibold text-foreground">{min}%</span>. Negocia con el proveedor antes de aprobar si está por debajo.
          </p>
        </div>
        <Totals items={items.data ?? []} min={min} />
      </div>

      {items.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (items.data ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">Esta orden no tiene productos vinculados.</p>
      ) : (
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                <th className="py-2 pr-3 font-medium">Producto</th>
                <th className="py-2 px-3 font-medium text-right">Cant.</th>
                <th className="py-2 px-3 font-medium text-right">Venta</th>
                <th className="py-2 px-3 font-medium text-right">Costo proveedor</th>
                <th className="py-2 px-3 font-medium">Proveedor</th>
                <th className="py-2 px-3 font-medium">Margen</th>
                <th className="py-2 pl-3" />
              </tr>
            </thead>
            <tbody>
              {(items.data ?? []).map((it) => (
                <ItemRow
                  key={it.id}
                  item={it}
                  min={min}
                  suppliers={suppliers.data ?? []}
                  onSaved={() => {
                    qc.invalidateQueries({ queryKey: ["production-order-items", productionOrderId] });
                    qc.invalidateQueries({ queryKey: ["production-audit", productionOrderId] });
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Totals({ items, min }: { items: Item[]; min: number }) {
  const totals = useMemo(() => {
    let sale = 0;
    let cost = 0;
    let allHaveCost = items.length > 0;
    for (const it of items) {
      sale += Number(it.line_total) || 0;
      if (it.manufacturing_cost == null) allHaveCost = false;
      else cost += Number(it.manufacturing_cost);
    }
    const pct = allHaveCost && sale > 0 ? ((sale - cost) / sale) * 100 : null;
    return { sale, cost: allHaveCost ? cost : null, pct };
  }, [items]);
  if (items.length === 0) return null;
  return (
    <div className="flex items-center gap-4 text-xs">
      <div>
        <p className="text-muted-foreground">Venta total</p>
        <p className="font-semibold text-sm">{fmtMoney(totals.sale)}</p>
      </div>
      <div>
        <p className="text-muted-foreground">Costo total</p>
        <p className="font-semibold text-sm">{fmtMoney(totals.cost)}</p>
      </div>
      <div>
        <p className="text-muted-foreground mb-0.5">Margen global</p>
        <MarginPill pct={totals.pct} min={min} />
      </div>
    </div>
  );
}

function ItemRow({
  item,
  min,
  suppliers,
  onSaved,
}: {
  item: Item;
  min: number;
  suppliers: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const [cost, setCost] = useState(item.manufacturing_cost != null ? String(item.manufacturing_cost) : "");
  const [supplierId, setSupplierId] = useState(item.supplier_id ?? "");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setCost(item.manufacturing_cost != null ? String(item.manufacturing_cost) : "");
    setSupplierId(item.supplier_id ?? "");
    setDirty(false);
  }, [item.id, item.manufacturing_cost, item.supplier_id]);

  // Live preview of margin while typing, before save
  const livePct = useMemo(() => {
    const c = cost === "" ? null : Number(cost);
    const line = Number(item.line_total) || 0;
    if (c == null || isNaN(c) || line <= 0) return null;
    return ((line - c) / line) * 100;
  }, [cost, item.line_total]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("order_items")
        .update({
          manufacturing_cost: cost === "" ? null : Number(cost),
          supplier_id: supplierId || null,
        })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Costo guardado");
      onSaved();
      setDirty(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  return (
    <tr className="border-b border-border/60 align-top">
      <td className="py-3 pr-3 max-w-xs">
        <p className="font-medium truncate">{firstLine(item.description) || "—"}</p>
        <p className="text-[11px] text-muted-foreground">{fmtMoney(item.unit_price)} c/u</p>
      </td>
      <td className="py-3 px-3 text-right tabular-nums">{Number(item.quantity)}</td>
      <td className="py-3 px-3 text-right font-medium tabular-nums">{fmtMoney(item.line_total)}</td>
      <td className="py-3 px-3 text-right">
        <Input
          type="number"
          min="0"
          inputMode="numeric"
          value={cost}
          placeholder="0"
          className="h-8 w-32 text-right ml-auto"
          onChange={(e) => {
            setCost(e.target.value);
            setDirty(true);
          }}
        />
      </td>
      <td className="py-3 px-3">
        <Select
          value={supplierId || "__none__"}
          onValueChange={(v) => {
            setSupplierId(v === "__none__" ? "" : v);
            setDirty(true);
          }}
        >
          <SelectTrigger className="h-8 w-44">
            <SelectValue placeholder="Sin proveedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Sin proveedor</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="py-3 px-3">
        <MarginPill pct={livePct} min={min} />
      </td>
      <td className="py-3 pl-3 text-right">
        <Button
          size="sm"
          variant={dirty ? "default" : "outline"}
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
          className="gap-1 h-8"
        >
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Guardar
        </Button>
      </td>
    </tr>
  );
}
