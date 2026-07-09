import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Package, TrendingUp, Building2, CalendarDays, Handshake, Layers, Link2, Unlink, CheckCircle2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/features/orders/money-input";
import { MarginPill, marginTone } from "./margin-pill";
import { ItemPhasesEditor } from "./item-phases-editor";
import { LinkChildItemDialog } from "./link-child-item-dialog";

type Item = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  manufacturing_cost: number | null;
  negotiated_cost: number | null;
  margin_pct: number | null;
  supplier_id: string | null;
  cost_notes: string | null;
  quotation_date: string | null;
  has_phases?: boolean | null;
  parent_item_id?: string | null;
  ready_for_advance_payment?: boolean | null;
  order_id: string;
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
    queryKey: ["production-order-items", productionOrderId, orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, description, quantity, unit_price, line_total, manufacturing_cost, negotiated_cost, margin_pct, supplier_id, cost_notes, sort_order, quotation_date, production_order_id, order_id, has_phases, parent_item_id, ready_for_advance_payment")
        .or(`production_order_id.eq.${productionOrderId},and(order_id.eq.${orderId},production_order_id.is.null)`)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });


  const min = Number(settings.data?.min_margin_pct ?? 45);
  const list = items.data ?? [];

  // Agrupar por padre
  const { roots, childrenByParent } = useMemo(() => {
    const roots: Item[] = [];
    const map = new Map<string, Item[]>();
    for (const it of list) {
      if (it.parent_item_id) {
        const arr = map.get(it.parent_item_id) ?? [];
        arr.push(it);
        map.set(it.parent_item_id, arr);
      } else {
        roots.push(it);
      }
    }
    return { roots, childrenByParent: map };
  }, [list]);

  const phasedItemIds = useMemo(() => list.filter((i) => i.has_phases).map((i) => i.id), [list]);

  const phasesCosts = useQuery({
    queryKey: ["item-phases-costs", productionOrderId, phasedItemIds.join(",")],
    enabled: phasedItemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("order_item_phases")
        .select("order_item_id, manufacturing_cost, negotiated_cost")
        .in("order_item_id", phasedItemIds);
      if (error) throw error;
      const map = new Map<string, number>();
      for (const p of (data ?? []) as any[]) {
        const eff = p.negotiated_cost ?? p.manufacturing_cost;
        if (eff == null) continue;
        map.set(p.order_item_id, (map.get(p.order_item_id) ?? 0) + Number(eff));
      }
      return map;
    },
  });

  // Costo efectivo por ítem (fases o negociado/original)
  const effectiveCostFor = (it: Item): number | null => {
    if (it.has_phases) {
      const c = phasesCosts.data?.get(it.id);
      return c != null && c > 0 ? c : null;
    }
    const eff = it.negotiated_cost ?? it.manufacturing_cost;
    return eff == null ? null : Number(eff);
  };

  // Totales: solo raíces suman venta; costos suman todo (raíces + hijos)
  const totals = useMemo(() => {
    let sale = 0;
    let cost = 0;
    let allHaveCost = list.length > 0;
    for (const root of roots) {
      sale += Number(root.line_total) || 0;
      const rc = effectiveCostFor(root);
      if (rc == null) allHaveCost = false;
      else cost += rc;
      const kids = childrenByParent.get(root.id) ?? [];
      for (const child of kids) {
        const cc = effectiveCostFor(child);
        if (cc == null) allHaveCost = false;
        else cost += cc;
      }
    }
    const pct = allHaveCost && sale > 0 ? ((sale - cost) / sale) * 100 : null;
    return { sale, cost: allHaveCost ? cost : null, pct };
  }, [list, roots, childrenByParent, phasesCosts.data]);

  // Items elegibles para vincular como hijos (misma orden, sin padre, sin hijos, no is self)
  const parentIds = useMemo(() => new Set(list.map((i) => i.parent_item_id).filter(Boolean) as string[]), [list]);
  const eligibleFor = (rootId: string) =>
    list.filter((i) => i.id !== rootId && !i.parent_item_id && !parentIds.has(i.id));

  const invalidateAll = (itemId?: string) => {
    qc.invalidateQueries({ queryKey: ["production-order-items", productionOrderId, orderId] });
    qc.invalidateQueries({ queryKey: ["production-audit", productionOrderId] });
    qc.invalidateQueries({ queryKey: ["item-phases-costs", productionOrderId] });
    if (itemId) qc.invalidateQueries({ queryKey: ["item-phases", itemId] });
  };

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
          roots.map((it) => {
            const kids = childrenByParent.get(it.id) ?? [];
            const kidsCost = kids.reduce((acc, k) => {
              const c = effectiveCostFor(k);
              return acc + (c ?? 0);
            }, 0);
            const kidsAllHaveCost = kids.every((k) => effectiveCostFor(k) != null);
            return (
              <ItemCard
                key={it.id}
                item={it}
                min={min}
                suppliers={suppliers.data ?? []}
                brandId={brandId}
                productionOrderId={productionOrderId}
                isChild={false}
                childrenItems={kids}
                childrenCost={kidsCost}
                childrenAllHaveCost={kidsAllHaveCost}
                eligibleChildren={eligibleFor(it.id)}
                onSaved={() => invalidateAll(it.id)}
                onChildAction={() => invalidateAll()}
                renderChild={(child) => (
                  <ItemCard
                    key={child.id}
                    item={child}
                    min={min}
                    suppliers={suppliers.data ?? []}
                    brandId={brandId}
                    productionOrderId={productionOrderId}
                    isChild
                    childrenItems={[]}
                    childrenCost={0}
                    childrenAllHaveCost={true}
                    eligibleChildren={[]}
                    onSaved={() => invalidateAll(child.id)}
                    onChildAction={() => invalidateAll()}
                    renderChild={() => null}
                  />
                )}
              />
            );
          })
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
  brandId,
  productionOrderId,
  isChild,
  childrenItems,
  childrenCost,
  childrenAllHaveCost,
  eligibleChildren,
  onSaved,
  onChildAction,
  renderChild,
}: {
  item: Item;
  min: number;
  suppliers: { id: string; name: string }[];
  brandId: string;
  productionOrderId: string;
  isChild: boolean;
  childrenItems: Item[];
  childrenCost: number;
  childrenAllHaveCost: boolean;
  eligibleChildren: Item[];
  onSaved: () => void;
  onChildAction: () => void;
  renderChild: (child: Item) => React.ReactNode;
}) {
  const [cost, setCost] = useState<number>(item.manufacturing_cost != null ? Number(item.manufacturing_cost) : 0);
  const [hasCost, setHasCost] = useState<boolean>(item.manufacturing_cost != null);
  const [negotiatedCost, setNegotiatedCost] = useState<number>(item.negotiated_cost != null ? Number(item.negotiated_cost) : 0);
  const [hasNegotiated, setHasNegotiated] = useState<boolean>(item.negotiated_cost != null);
  const [supplierId, setSupplierId] = useState(item.supplier_id ?? "");
  const [quotationDate, setQuotationDate] = useState(item.quotation_date ?? "");
  const [dirty, setDirty] = useState(false);
  const [hasPhases, setHasPhases] = useState<boolean>(!!item.has_phases);
  const [linkOpen, setLinkOpen] = useState(false);

  useEffect(() => {
    setCost(item.manufacturing_cost != null ? Number(item.manufacturing_cost) : 0);
    setHasCost(item.manufacturing_cost != null);
    setNegotiatedCost(item.negotiated_cost != null ? Number(item.negotiated_cost) : 0);
    setHasNegotiated(item.negotiated_cost != null);
    setSupplierId(item.supplier_id ?? "");
    setQuotationDate(item.quotation_date ?? "");
    setHasPhases(!!item.has_phases);
    setDirty(false);
  }, [item.id, item.manufacturing_cost, item.negotiated_cost, item.supplier_id, item.quotation_date, item.has_phases]);

  const toggleHasPhases = useMutation({
    mutationFn: async (next: boolean) => {
      if (!next) {
        const { count } = await (supabase as any)
          .from("order_item_phases")
          .select("id", { count: "exact", head: true })
          .eq("order_item_id", item.id);
        if ((count ?? 0) > 0) {
          throw new Error("Elimina primero todas las fases para volver a modo proveedor único.");
        }
      }
      const { error } = await supabase
        .from("order_items")
        .update({ has_phases: next })
        .eq("id", item.id);
      if (error) throw error;
      if (next) {
        const { count } = await (supabase as any)
          .from("order_item_phases")
          .select("id", { count: "exact", head: true })
          .eq("order_item_id", item.id);
        if ((count ?? 0) === 0) {
          const { error: insErr } = await (supabase as any).from("order_item_phases").insert({
            order_item_id: item.id,
            order_id: item.order_id,
            brand_id: brandId,
            production_order_id: productionOrderId,
            phase_index: 1,
            name: "Fase 1",
            status: "pendiente",
          });
          if (insErr) throw insErr;
        }
      }
    },
    onSuccess: (_r, next) => {
      setHasPhases(next);
      toast.success(next ? "Producto marcado como multi-proveedor" : "Volviste a proveedor único");
      onSaved();
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const unlink = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("order_items")
        .update({ parent_item_id: null } as any)
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Producto desvinculado");
      onChildAction();
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const line = Number(item.line_total) || 0;

  const originalPct = useMemo(() => {
    if (!hasCost || line <= 0) return null;
    return ((line - cost) / line) * 100;
  }, [cost, hasCost, line]);

  const showNegotiation = !isChild && !hasPhases && hasCost && originalPct != null && originalPct < min;

  const negotiatedPct = useMemo(() => {
    if (!hasNegotiated || line <= 0) return null;
    return ((line - negotiatedCost) / line) * 100;
  }, [negotiatedCost, hasNegotiated, line]);

  // Costo efectivo propio (proveedor único o fases via prop de padre... aquí lo aproximamos:
  // si has_phases queda al header del root gestionar; en padre calculamos abajo).
  const ownEffective: number | null = hasPhases
    ? null // el header del root se apoya en childrenCost + query externa; en child no aplica al margen
    : (hasNegotiated ? negotiatedCost : (hasCost ? cost : null));

  // Margen del grupo (solo tiene sentido en el padre = !isChild)
  const groupCostSelf = useMemo(() => {
    // Cuando es padre con fases, no conocemos aquí el costo de fases; se refleja a través
    // de invalidaciones y re-render con phasesCost via query externa; para el pill del padre
    // aquí usamos "self only if !has_phases".
    if (isChild) return null;
    if (hasPhases) {
      // Delegamos: si tiene fases, aproximamos con lo que llegue en la query externa.
      // El pill fase-only ya se muestra abajo; aquí devolvemos null para no mostrar duplicado engañoso.
      return null;
    }
    const eff = hasNegotiated ? negotiatedCost : (hasCost ? cost : null);
    return eff;
  }, [isChild, hasPhases, hasCost, hasNegotiated, cost, negotiatedCost]);

  const groupTotalCost = useMemo(() => {
    if (isChild) return null;
    if (groupCostSelf == null || !childrenAllHaveCost) return null;
    return groupCostSelf + childrenCost;
  }, [isChild, groupCostSelf, childrenAllHaveCost, childrenCost]);

  const groupPct = useMemo(() => {
    if (isChild) return null;
    if (groupTotalCost == null || line <= 0) return null;
    return ((line - groupTotalCost) / line) * 100;
  }, [isChild, groupTotalCost, line]);

  // Fases del item (para mostrar costo y margen cuando has_phases=true, sin depender del padre externo)
  const itemPhases = useQuery({
    queryKey: ["item-phases", item.id],
    enabled: hasPhases,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("order_item_phases")
        .select("id, manufacturing_cost, negotiated_cost, supplier_id, quotation_date")
        .eq("order_item_id", item.id);
      if (error) throw error;
      return (data ?? []) as { id: string; manufacturing_cost: number | null; negotiated_cost: number | null; supplier_id: string | null; quotation_date: string | null }[];
    },
  });

  const phasesCost = useMemo(() => {
    if (!hasPhases || !itemPhases.data) return null;
    let total = 0;
    let any = false;
    for (const p of itemPhases.data) {
      const eff = p.negotiated_cost ?? p.manufacturing_cost;
      if (eff == null) continue;
      any = true;
      total += Number(eff);
    }
    return any ? total : null;
  }, [hasPhases, itemPhases.data]);


  // Costo efectivo del ítem (para mostrar como "aporta al grupo" en un child)
  const effectiveForDisplay = hasPhases ? phasesCost : ownEffective;

  // Margen que se muestra en el pill:
  // - Padre con hijos: groupPct (usa phasesCost si tiene fases, sumando hijos)
  // - Padre sin hijos: comportamiento anterior (fases o negociado/original)
  // - Child: sin pill
  const parentGroupPctWithPhases = useMemo(() => {
    if (isChild || childrenItems.length === 0) return null;
    const self = hasPhases ? phasesCost : ownEffective;
    if (self == null || !childrenAllHaveCost) return null;
    if (line <= 0) return null;
    return ((line - (self + childrenCost)) / line) * 100;
  }, [isChild, childrenItems.length, hasPhases, phasesCost, ownEffective, childrenAllHaveCost, childrenCost, line]);

  const soloPct = !hasPhases
    ? (hasNegotiated ? negotiatedPct : originalPct)
    : (phasesCost != null && line > 0 ? ((line - phasesCost) / line) * 100 : null);

  const livePct = isChild ? null : (childrenItems.length > 0 ? parentGroupPctWithPhases : soloPct);

  const savingsPct = (!hasPhases && hasCost && hasNegotiated && cost > 0)
    ? ((cost - negotiatedCost) / cost) * 100
    : null;

  const tone = marginTone(livePct, min);

  const accentBar = isChild
    ? "bg-primary/40"
    : tone === "ok"
      ? "bg-emerald-500"
      : tone === "warn"
        ? "bg-amber-500"
        : tone === "bad"
          ? "bg-rose-500"
          : "bg-muted-foreground/30";

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("order_items")
        .update({
          manufacturing_cost: hasCost ? cost : null,
          negotiated_cost: hasNegotiated ? negotiatedCost : null,
          negotiated_at: hasNegotiated ? new Date().toISOString() : null,
          negotiated_by: hasNegotiated ? (u.user?.id ?? null) : null,
          supplier_id: supplierId || null,
          quotation_date: quotationDate || null,
        })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Guardado");
      onSaved();
      setDirty(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const isReady = !!item.ready_for_advance_payment;
  const canApprove =
    !hasPhases &&
    !dirty &&
    !!supplierId &&
    !!quotationDate &&
    ((hasNegotiated && negotiatedCost > 0) || (hasCost && cost > 0));

  const toggleApproval = useMutation({
    mutationFn: async (next: boolean) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("order_items")
        .update({
          ready_for_advance_payment: next,
          ready_for_advance_payment_at: next ? new Date().toISOString() : null,
          ready_for_advance_payment_by: next ? (u.user?.id ?? null) : null,
        } as any)
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: (_r, next) => {
      toast.success(next ? "Cotización aprobada — enviada a pagos" : "Aprobación revertida");
      onSaved();
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const title = firstLine(item.description) || "Producto";
  const details = restLines(item.description);

  return (
    <article className={`relative rounded-xl border overflow-hidden transition-shadow hover:shadow-sm ${
      isChild ? "border-border/60 bg-muted/20 ml-4" : "border-border bg-background"
    }`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${accentBar}`} />
      <div className="p-4 pl-5 space-y-4">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              {isChild && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold uppercase tracking-wide">
                  Vinculado
                </span>
              )}
              <h3 className="font-semibold text-sm leading-tight">{title}</h3>
              <span className="text-[11px] text-muted-foreground">×{Number(item.quantity)}</span>
            </div>
            {details && (
              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 whitespace-pre-line">{details}</p>
            )}
          </div>
          <div className="text-right shrink-0 flex flex-col items-end gap-1">
            {isChild ? (
              <>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Aporta al grupo</p>
                <p className="font-bold tabular-nums text-sm">{fmtMoney(effectiveForDisplay)}</p>
                <button
                  onClick={() => unlink.mutate()}
                  disabled={unlink.isPending}
                  className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-rose-600 transition-colors"
                  title="Desvincular del padre"
                >
                  <Unlink className="h-3 w-3" /> Desvincular
                </button>
              </>
            ) : (
              <>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Venta</p>
                <p className="font-bold tabular-nums text-base">{fmtMoney(line)}</p>
                {(childrenItems.length > 0 || hasPhases) && (
                  <div className="flex flex-col items-end gap-0.5 mt-1">
                    <span className="text-[10px] text-muted-foreground">
                      {childrenItems.length > 0 ? "Margen (grupo)" : "Margen (fases)"}
                    </span>
                    <MarginPill pct={livePct} min={min} />
                    {childrenItems.length > 0 && groupTotalCost != null && (
                      <span className="text-[10px] text-muted-foreground">
                        Costo grupo: <span className="tabular-nums font-medium">{fmtMoney(groupTotalCost)}</span>
                      </span>
                    )}
                    {childrenItems.length === 0 && hasPhases && phasesCost != null && (
                      <span className="text-[10px] text-muted-foreground">
                        Costo fases: <span className="tabular-nums font-medium">{fmtMoney(phasesCost)}</span>
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Toggle multi-proveedor */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold leading-tight">Este producto tiene más de un proveedor</p>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Actívalo para dividir el producto en fases (ej. construcción, pintura) con proveedor y costo independiente.
              </p>
            </div>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={hasPhases}
              disabled={toggleHasPhases.isPending}
              onChange={(e) => toggleHasPhases.mutate(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span className="text-[11px] font-medium">{hasPhases ? "Multi-proveedor" : "Un proveedor"}</span>
          </label>
        </div>

        {!hasPhases && (
          <>
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
              {!isChild && childrenItems.length === 0 && (
                <div className="flex flex-col items-end gap-1.5">
                  <span className="text-[11px] text-muted-foreground">Margen</span>
                  <MarginPill pct={livePct} min={min} />
                  {hasNegotiated && originalPct != null && (
                    <span className="text-[10px] text-muted-foreground">
                      Original: <span className="line-through">{originalPct.toFixed(1)}%</span>
                    </span>
                  )}
                </div>
              )}
            </div>

            {showNegotiation && childrenItems.length === 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Handshake className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" />
                  <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-200 uppercase tracking-wide">
                    Negociación requerida — margen original {originalPct?.toFixed(1)}%
                  </p>
                </div>
                <p className="text-[11px] text-amber-700/90 dark:text-amber-200/80">
                  Negocia con el proveedor para alcanzar al menos {min}%. Este será el costo real que usará producción y queda registrado para evaluar tu gestión.
                </p>
                <div className="grid sm:grid-cols-2 gap-3 items-end">
                  <div>
                    <Label className="text-[11px] text-muted-foreground mb-1.5 block">
                      Costo proveedor con negociación (COP)
                    </Label>
                    <MoneyInput
                      value={negotiatedCost}
                      onValueChange={(n) => {
                        setNegotiatedCost(n);
                        setHasNegotiated(n > 0);
                        setDirty(true);
                      }}
                      placeholder="0"
                      className="h-9 bg-background"
                    />
                  </div>
                  {hasNegotiated && savingsPct != null && (
                    <div className="text-[11px] space-y-0.5">
                      <p className="text-muted-foreground">
                        {fmtMoney(cost)} → <span className="font-semibold text-foreground">{fmtMoney(negotiatedCost)}</span>
                      </p>
                      <p className={savingsPct > 0 ? "text-emerald-700 dark:text-emerald-300 font-medium" : "text-muted-foreground"}>
                        Ahorro: {savingsPct.toFixed(1)}% · Nuevo margen: {negotiatedPct?.toFixed(1)}%
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <Label className="text-[11px] text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <CalendarDays className="h-3 w-3" /> Fecha de cotización (este producto)
              </Label>
              <Input
                type="date"
                value={quotationDate}
                onChange={(e) => {
                  setQuotationDate(e.target.value);
                  setDirty(true);
                }}
                className="h-9 max-w-[220px]"
              />
            </div>

          </>
        )}

        {hasPhases && (
          <ItemPhasesEditor
            orderItemId={item.id}
            orderId={item.order_id}
            brandId={brandId}
            productionOrderId={productionOrderId}
            suppliers={suppliers}
            onChanged={onSaved}
          />
        )}

        {!isChild && !hasPhases && (
          <div className={`rounded-lg border p-3 space-y-2 ${
            isReady
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-amber-500/40 bg-amber-500/5"
          }`}>
            <div className="flex items-start gap-2">
              <ShieldCheck className={`h-4 w-4 shrink-0 mt-0.5 ${isReady ? "text-emerald-600" : "text-amber-600"}`} />
              <div className="min-w-0 flex-1">
                <p className={`text-[11px] font-semibold uppercase tracking-wide ${isReady ? "text-emerald-800 dark:text-emerald-200" : "text-amber-800 dark:text-amber-200"}`}>
                  {isReady ? "Cotización aprobada — enviada a pagos" : "Pendiente de aprobación para enviar a pagos"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {isReady
                    ? "Este producto ya está en la cola de pagos a proveedores. Si modificas proveedor, costo o fecha de cotización, la aprobación se revierte automáticamente."
                    : "Verifica proveedor, costo y fecha de cotización. Cuando esté todo listo, marca la casilla para enviar el pago del anticipo a Finanzas."}
                </p>
              </div>
            </div>
            <label className={`flex items-center gap-2 cursor-pointer select-none ${!canApprove && !isReady ? "opacity-60" : ""}`}>
              <input
                type="checkbox"
                checked={isReady}
                disabled={toggleApproval.isPending || dirty || (!isReady && !canApprove)}
                onChange={(e) => toggleApproval.mutate(e.target.checked)}
                className="h-4 w-4 accent-emerald-600"
              />
              <span className="text-[12px] font-medium">
                {isReady ? "Aprobado — desmarcar para revertir" : "Aprobar y enviar a pagos a proveedores"}
              </span>
              {toggleApproval.isPending && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
            </label>
            {!isReady && dirty && (
              <p className="text-[10px] text-amber-700 dark:text-amber-300">
                Guarda los cambios antes de aprobar.
              </p>
            )}
            {!isReady && !dirty && !canApprove && (
              <p className="text-[10px] text-muted-foreground">
                Requiere proveedor, costo &gt; 0 y fecha de cotización.
              </p>
            )}
          </div>
        )}



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

        {/* Hijos vinculados dentro de la card del padre */}
        {!isChild && childrenItems.length > 0 && (
          <div className="pt-2 border-t border-dashed border-border space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1.5">
              <Link2 className="h-3 w-3" /> Productos vinculados ({childrenItems.length})
            </p>
            {childrenItems.map((child) => renderChild(child))}
          </div>
        )}

        {/* Botón para vincular productos: solo en el padre */}
        {!isChild && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="gap-1 h-7 text-[11px]"
              onClick={() => setLinkOpen(true)}
              disabled={eligibleChildren.length === 0}
              title={eligibleChildren.length === 0 ? "No hay más productos disponibles en esta orden" : "Vincular productos hijos"}
            >
              <Link2 className="h-3 w-3" />
              Vincular productos
            </Button>
            {eligibleChildren.length === 0 && childrenItems.length === 0 && (
              <span className="text-[10px] text-muted-foreground">No hay más productos disponibles</span>
            )}
          </div>
        )}

        {!isChild && (
          <LinkChildItemDialog
            open={linkOpen}
            onOpenChange={setLinkOpen}
            parentId={item.id}
            eligible={eligibleChildren.map((e) => ({
              id: e.id,
              description: e.description,
              quantity: e.quantity,
              line_total: e.line_total,
            }))}
            onLinked={onChildAction}
          />
        )}
      </div>
    </article>
  );
}
