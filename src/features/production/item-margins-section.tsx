import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Package, TrendingUp, Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/features/orders/money-input";
import { MarginPill, marginTone } from "./margin-pill";

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

function restLines(s: string) {
  const idx = s.indexOf("\n");
  return idx === -1 ? "" : s.slice(idx + 1).trim();
}

export function ItemMarginsSection({
  productionOrderId,
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
  const list = items.data ?? [];

  const totals = useMemo(() => {
    let sale = 0;
    let cost = 0;
    let allHaveCost = list.length > 0;
    for (const it of list) {
      sale += Number(it.line_total) || 0;
      if (it.manufacturing_cost == null) allHaveCost = false;
      else cost += Number(it.manufacturing_cost);
    }
    const pct = allHaveCost && sale > 0 ? ((sale - cost) / sale) * 100 : null;
    return { sale, cost: allHaveCost ? cost : null, pct };
  }, [list]);

  return (
    <section className="rounded-2xl border border-border bg-gradient-to-br from-surface to-surface/40 overflow-hidden shadow-sm">
      <header className="px-5 py-4 border-b border-border bg-muted/30">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
              <Package className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold leading-tight">Productos y márgenes</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Margen mínimo: <span className="font-semibold text-foreground">{min}%</span> · negocia antes de aprobar si está por debajo
              </p>
            </div>
          </div>
        </div>

        {list.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
            <KpiTile label="Venta total" value={fmtMoney(totals.sale)} tone="neutral" />
            <KpiTile label="Costo total" value={fmtMoney(totals.cost)} tone="neutral" />
            <KpiTile
              label="Margen global"
              value={totals.pct == null ? "Sin costo" : `${totals.pct.toFixed(1)}%`}
              tone={totals.pct == null ? "muted" : marginTone(totals.pct, min)}
            />
          </div>
        )}
      </header>

      <div className="p-4 sm:p-5 space-y-3">
        {items.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : list.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Esta orden no tiene productos vinculados.</p>
        ) : (
          list.map((it) => (
            <ItemCard
              key={it.id}
              item={it}
              min={min}
              suppliers={suppliers.data ?? []}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ["production-order-items", productionOrderId] });
                qc.invalidateQueries({ queryKey: ["production-audit", productionOrderId] });
              }}
            />
          ))
        )}
      </div>
    </section>
  );
}

function KpiTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "ok" | "warn" | "bad" | "muted";
}) {
  const toneCls =
    tone === "ok"
      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
      : tone === "warn"
        ? "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"
        : tone === "bad"
          ? "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300"
          : tone === "muted"
            ? "border-border bg-muted/30 text-muted-foreground"
            : "border-border bg-background text-foreground";
  return (
    <div className={`rounded-lg border px-3 py-2 ${toneCls}`}>
      <p className="text-[10px] uppercase tracking-wide opacity-70 font-medium">{label}</p>
      <p className="text-sm font-bold tabular-nums mt-0.5 truncate">{value}</p>
    </div>
  );
}

function ItemCard({
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
  const [cost, setCost] = useState<number>(item.manufacturing_cost != null ? Number(item.manufacturing_cost) : 0);
  const [hasCost, setHasCost] = useState<boolean>(item.manufacturing_cost != null);
  const [supplierId, setSupplierId] = useState(item.supplier_id ?? "");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setCost(item.manufacturing_cost != null ? Number(item.manufacturing_cost) : 0);
    setHasCost(item.manufacturing_cost != null);
    setSupplierId(item.supplier_id ?? "");
    setDirty(false);
  }, [item.id, item.manufacturing_cost, item.supplier_id]);

  const line = Number(item.line_total) || 0;
  const livePct = useMemo(() => {
    if (!hasCost || line <= 0) return null;
    return ((line - cost) / line) * 100;
  }, [cost, hasCost, line]);

  const tone = marginTone(livePct, min);

  const accentBar =
    tone === "ok"
      ? "bg-emerald-500"
      : tone === "warn"
        ? "bg-amber-500"
        : tone === "bad"
          ? "bg-rose-500"
          : "bg-muted-foreground/30";

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("order_items")
        .update({
          manufacturing_cost: hasCost ? cost : null,
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

  const title = firstLine(item.description) || "Producto";
  const details = restLines(item.description);

  return (
    <article className="relative rounded-xl border border-border bg-background overflow-hidden transition-shadow hover:shadow-sm">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${accentBar}`} />
      <div className="p-4 pl-5 space-y-4">
        {/* Top row: product + sale + margin pill */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h3 className="font-semibold text-sm leading-tight">{title}</h3>
              <span className="text-[11px] text-muted-foreground">×{Number(item.quantity)}</span>
            </div>
            {details && (
              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 whitespace-pre-line">{details}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Venta</p>
            <p className="font-bold tabular-nums text-base">{fmtMoney(line)}</p>
          </div>
        </div>

        {/* Inputs row */}
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <Label className="text-[11px] text-muted-foreground flex items-center gap-1.5 mb-1.5">
              <TrendingUp className="h-3 w-3" /> Costo proveedor (COP)
            </Label>
            <MoneyInput
              value={cost}
              onValueChange={(n) => {
                setCost(n);
                setHasCost(true);
                setDirty(true);
              }}
              placeholder="0"
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground flex items-center gap-1.5 mb-1.5">
              <Building2 className="h-3 w-3" /> Proveedor
            </Label>
            <Select
              value={supplierId || "__none__"}
              onValueChange={(v) => {
                setSupplierId(v === "__none__" ? "" : v);
                setDirty(true);
              }}
            >
              <SelectTrigger className="h-9">
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
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-[11px] text-muted-foreground">Margen</span>
            <MarginPill pct={livePct} min={min} />
          </div>
        </div>

        {/* Save button */}
        {dirty && (
          <div className="flex justify-end pt-1">
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="gap-1 h-8"
            >
              {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Guardar
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
