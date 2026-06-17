import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import {
  Loader2, Factory, Search, ArrowLeft, ClipboardList, ExternalLink,
  Package, CalendarDays, AlertTriangle, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NOVEDADES, novedadMeta } from "@/features/production/novedad-meta";
import { MoneyInput } from "@/features/orders/money-input";

export const Route = createFileRoute("/_authenticated/erp/production/tracking")({
  head: () => ({ meta: [{ title: "Seguimiento de producción — ERP" }] }),
  component: TrackingPage,
});

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR + 1, CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];
const ACCEPTED_STATUSES = ["en_proceso", "control_calidad", "listo", "entregado"];

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}
function fmtMoneyShort(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$ ${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`;
  if (n >= 1_000) return `$ ${Math.round(n / 1000)}k`;
  return fmtMoney(n);
}
function fmtDateShort(s: string | null) {
  if (!s) return "—";
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}
function daysDiff(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}
function firstLine(s: string | null | undefined) {
  if (!s) return "";
  const i = s.indexOf("\n");
  return i === -1 ? s : s.slice(0, i);
}

function marginCls(margin: number | null) {
  if (margin == null) return { pill: "bg-muted text-muted-foreground border-border", bar: "bg-muted-foreground/30" };
  if (margin >= 45) return { pill: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", bar: "bg-emerald-500" };
  if (margin >= 30) return { pill: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30", bar: "bg-amber-500" };
  return { pill: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30", bar: "bg-rose-500" };
}

function TrackingPage() {
  const { brands, selectedBrandId, setSelectedBrandId, loading } = useBrand();
  const qc = useQueryClient();
  const [novedadFilter, setNovedadFilter] = useState<string>("all");
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const selectedBrand = brands.find((b) => b.id === selectedBrandId);

  useEffect(() => {
    if (!selectedBrandId) return;
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ["production-orders-drive"], refetchType: "all" });
      qc.invalidateQueries({ queryKey: ["production-orders-pending"], refetchType: "all" });
      qc.invalidateQueries({ queryKey: ["production-hub-counts"], refetchType: "all" });
    };
    const channel = supabase
      .channel(`production-tracking-${selectedBrandId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "production_orders", filter: `brand_id=eq.${selectedBrandId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "order_items" },
        refresh,
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedBrandId, qc]);

  const suppliersQ = useQuery({
    queryKey: ["suppliers-list", selectedBrandId],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers").select("id, name")
        .eq("brand_id", selectedBrandId!).eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const q = useQuery({
    queryKey: ["production-orders-drive", selectedBrandId, novedadFilter, year],
    enabled: !!selectedBrandId,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const from = `${year}-01-01`;
      const to = `${year + 1}-01-01`;
      let query = supabase
        .from("production_orders")
        .select(`
          id, code, novedad, status, supplier_id, manufacturing_cost, margin_pct,
          invoice_date, planimetry_sent_date, quotation_date, production_start_date,
          supplier_promised_date, supplier_actual_date, client_promised_date, client_actual_date,
          assigned_to_label, notes, created_at, order_id,
          order:orders!order_id(
            id, order_number, invoice_number, customer_name, customer_phone, customer_email,
            total, seller_id
          )
        `)
        .eq("brand_id", selectedBrandId!)
        .in("status", ACCEPTED_STATUSES)
        .gte("created_at", from)
        .lt("created_at", to)
        .order("created_at", { ascending: false });
      if (novedadFilter !== "all") query = query.eq("novedad", novedadFilter as any);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as any[];

      const poIds = rows.map((r) => r.id);
      const supplierIds = Array.from(new Set(rows.map((r) => r.supplier_id).filter(Boolean)));
      const sellerIds = Array.from(new Set(rows.map((r) => r.order?.seller_id).filter(Boolean)));

      const [suppliersRes, itemsRes, sellersRes] = await Promise.all([
        supplierIds.length
          ? supabase.from("suppliers").select("id, name").in("id", supplierIds)
          : Promise.resolve({ data: [], error: null } as any),
        poIds.length
          ? supabase
              .from("order_items")
              .select("id, production_order_id, description, quantity, unit_price, line_total, sort_order, supplier_id, supplier_promised_date, supplier_actual_date, production_started_at, production_due_date, quotation_date")
              .in("production_order_id", poIds)
              .order("sort_order", { ascending: true })
          : Promise.resolve({ data: [], error: null } as any),
        sellerIds.length
          ? supabase.from("profiles").select("user_id, display_name, email").in("user_id", sellerIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      // Also fetch suppliers for items (may include suppliers not on the PO)
      const itemSupplierIds = Array.from(new Set(
        ((itemsRes.data ?? []) as any[]).map((it: any) => it.supplier_id).filter(Boolean),
      ));
      const allSupplierIds = Array.from(new Set([...supplierIds, ...itemSupplierIds]));
      let extraSuppliers: any[] = suppliersRes.data ?? [];
      if (itemSupplierIds.some((id) => !supplierIds.includes(id)) && allSupplierIds.length) {
        const { data: allSup } = await supabase.from("suppliers").select("id, name").in("id", allSupplierIds);
        extraSuppliers = allSup ?? extraSuppliers;
      }
      const suppliersById = new Map(extraSuppliers.map((s: any) => [s.id, s]));
      const sellersById = new Map((sellersRes.data ?? []).map((s: any) => [s.user_id, s]));
      const itemsByPo = new Map<string, any[]>();
      for (const it of (itemsRes.data ?? []) as any[]) {
        const arr = itemsByPo.get(it.production_order_id) ?? [];
        arr.push({ ...it, supplier: it.supplier_id ? suppliersById.get(it.supplier_id) ?? null : null });
        itemsByPo.set(it.production_order_id, arr);
      }

      return rows.map((r) => {
        const items = itemsByPo.get(r.id) ?? [];
        const poSaleTotal = items.reduce((acc: number, it: any) => acc + (Number(it.line_total) || 0), 0);
        return {
          ...r,
          supplier: suppliersById.get(r.supplier_id) ?? null,
          items,
          po_sale_total: poSaleTotal,
          seller: r.order?.seller_id ? sellersById.get(r.order.seller_id) ?? null : null,
        };
      });
    },
  });

  const updateField = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, any> }) => {
      const { error } = await (supabase.from("production_orders") as any).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production-orders-drive"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error al actualizar"),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return q.data ?? [];
    return (q.data ?? []).filter((r: any) =>
      r.code?.toLowerCase().includes(term) ||
      r.supplier?.name?.toLowerCase().includes(term) ||
      r.assigned_to_label?.toLowerCase().includes(term) ||
      r.order?.invoice_number?.toLowerCase().includes(term) ||
      r.order?.order_number?.toLowerCase().includes(term) ||
      r.order?.customer_name?.toLowerCase().includes(term) ||
      r.seller?.display_name?.toLowerCase().includes(term),
    );
  }, [q.data, search]);

  const novedadCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of q.data ?? []) counts.set(r.novedad ?? "pendiente", (counts.get(r.novedad ?? "pendiente") ?? 0) + 1);
    return counts;
  }, [q.data]);

  const totalCount = q.data?.length ?? 0;
  const suppliers = suppliersQ.data ?? [];

  return (
    <div className="space-y-5">
      <div>
        <Link to="/erp/production" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="h-3 w-3" /> Volver a Producción
        </Link>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300 grid place-items-center">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold">Seguimiento de producción</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Vista densa estilo planilla. Click una fila para ver y editar todos los hitos
              {selectedBrand ? ` · ${selectedBrand.name}` : ""}.
            </p>
          </div>
        </div>
      </div>

      {!loading && brands.length > 0 && (
        <div className="flex gap-1 border-b border-border overflow-x-auto -mx-1 px-1">
          {brands.map((b) => {
            const active = b.id === selectedBrandId;
            return (
              <button key={b.id} onClick={() => setSelectedBrandId(b.id)}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}>
                <span className="inline-block h-2 w-2 rounded-full mr-2" style={{ background: b.primary_color }} />
                {b.slug.toUpperCase()} · {year}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar FAC, cliente, proveedor, vendedor…" className="pl-9 h-9" />
        </div>
        <Select value={novedadFilter} onValueChange={setNovedadFilter}>
          <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las novedades</SelectItem>
            {NOVEDADES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
          <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Chips por novedad */}
      {(q.data?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setNovedadFilter("all")}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
              novedadFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-primary/40"
            }`}
          >
            Todas · {totalCount}
          </button>
          {NOVEDADES.map((n) => {
            const c = novedadCounts.get(n.value) ?? 0;
            if (c === 0 && novedadFilter !== n.value) return null;
            const active = novedadFilter === n.value;
            return (
              <button
                key={n.value}
                onClick={() => setNovedadFilter(active ? "all" : n.value)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${active ? n.color : "bg-background border-border hover:border-primary/40 text-muted-foreground"}`}
              >
                {n.label} · {c}
              </button>
            );
          })}
        </div>
      )}

      {q.isLoading ? (
        <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Factory className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">Sin órdenes en seguimiento</p>
          <p className="text-xs text-muted-foreground mt-1">Acepta una orden desde "Aprobar órdenes" para que aparezca aquí.</p>
        </div>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">
            Mostrando <span className="font-semibold text-foreground">{filtered.length}</span> de {totalCount} órdenes
          </p>
          {/* Encabezado de columnas */}
          <div className="hidden xl:grid grid-cols-[1px_180px_120px_1fr_1.2fr_140px_120px_120px_90px_110px_32px] gap-2 px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold border-b border-border">
            <span />
            <span>Factura / OP</span>
            <span>Novedad</span>
            <span>Cliente / vend.</span>
            <span>Productos</span>
            <span>Proveedor</span>
            <span className="text-right">Costo</span>
            <span className="text-right">Venta</span>
            <span className="text-center">Margen</span>
            <span>Entrega</span>
            <span />
          </div>

          <div className="rounded-xl border border-border overflow-hidden divide-y divide-border bg-background">
            {filtered.map((r: any) => (
              <TrackingRow
                key={r.id}
                row={r}
                suppliers={suppliers}
                expanded={expanded === r.id}
                onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                onPatch={(patch) => updateField.mutate({ id: r.id, patch })}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TrackingRow({
  row, suppliers, expanded, onToggle, onPatch,
}: {
  row: any;
  suppliers: { id: string; name: string }[];
  expanded: boolean;
  onToggle: () => void;
  onPatch: (patch: Record<string, any>) => void;
}) {
  const r = row;
  const saleTotal = Number(r.po_sale_total) || 0;
  const invoiceTotal = Number(r.order?.total) || 0;
  const cost = r.manufacturing_cost == null ? null : Number(r.manufacturing_cost);
  const liveMargin = cost != null && saleTotal > 0 ? ((saleTotal - cost) / saleTotal) * 100 : null;
  const margin = liveMargin ?? (r.margin_pct == null ? null : Number(r.margin_pct));
  const cls = marginCls(margin);

  const desv = daysDiff(r.client_actual_date, r.client_promised_date);
  const desvDot =
    desv == null ? "bg-muted-foreground/40"
    : desv <= 0 ? "bg-emerald-500"
    : desv <= 3 ? "bg-amber-500"
    : "bg-rose-500";

  const novedad = novedadMeta(r.novedad);
  const items = r.items ?? [];
  const firstItem = items[0];
  const extra = items.length - 1;
  const vendedor = r.seller?.display_name || r.seller?.email || "—";
  const isPartial = items.length > 0 && invoiceTotal > 0 && saleTotal > 0 && Math.abs(invoiceTotal - saleTotal) > 1;

  return (
    <div className={`relative ${expanded ? "bg-muted/20" : "hover:bg-muted/30"} transition-colors`}>
      {/* Barra de acento por margen */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${cls.bar}`} />

      {/* Fila resumen */}
      <button
        onClick={onToggle}
        className="w-full text-left px-3 py-2.5 pl-4 grid grid-cols-[180px_120px_1fr_1.2fr_140px_120px_120px_90px_110px_32px] gap-2 items-center"
        style={{ minHeight: 56 }}
      >
        {/* Factura / OP */}
        <div className="min-w-0">
          <Link
            to="/erp/production/$id"
            params={{ id: r.id }}
            onClick={(e) => e.stopPropagation()}
            className="text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1 truncate"
          >
            {r.order?.invoice_number ? `Fact. ${r.order.invoice_number}` : r.code}
            <ExternalLink className="h-3 w-3 opacity-60 shrink-0" />
          </Link>
          <p className="font-mono text-[10px] text-muted-foreground truncate">{r.code}</p>
        </div>

        {/* Novedad inline select */}
        <div onClick={(e) => e.stopPropagation()}>
          <select
            value={r.novedad ?? "pendiente"}
            onChange={(e) => onPatch({ novedad: e.target.value })}
            className={`appearance-none border rounded-full px-2 py-0.5 text-[11px] font-medium cursor-pointer outline-none focus:ring-2 focus:ring-primary/40 w-full ${novedad.color}`}
          >
            {NOVEDADES.map((n) => (
              <option key={n.value} value={n.value} className="bg-background text-foreground">{n.label}</option>
            ))}
          </select>
        </div>

        {/* Cliente / vendedor */}
        <div className="min-w-0 text-xs">
          <p className="font-medium truncate text-foreground">{r.order?.customer_name ?? "—"}</p>
          <p className="text-muted-foreground truncate text-[11px]">Vend. {vendedor}</p>
        </div>

        {/* Productos */}
        <div className="min-w-0 text-xs" title={items.map((it: any) => `• ${firstLine(it.description)} ×${it.quantity}`).join("\n")}>
          {firstItem ? (
            <>
              <p className="truncate font-medium">{firstLine(firstItem.description) || "Producto"}</p>
              <p className="text-[11px] text-muted-foreground">
                ×{Number(firstItem.quantity)} · {fmtMoneyShort(Number(firstItem.unit_price))} c/u
                {extra > 0 && <span className="ml-1 text-primary font-medium">+{extra} más</span>}
              </p>
            </>
          ) : (
            <span className="text-muted-foreground italic">Sin productos</span>
          )}
        </div>

        {/* Proveedor inline */}
        <div onClick={(e) => e.stopPropagation()}>
          <InlineSupplier
            value={r.supplier_id ?? ""}
            suppliers={suppliers}
            onSave={(v) => onPatch({ supplier_id: v || null })}
          />
        </div>

        {/* Costo inline */}
        <div onClick={(e) => e.stopPropagation()} className="text-right">
          <InlineMoney
            value={cost ?? 0}
            hasValue={cost != null}
            onSave={(n, hasValue) => onPatch({ manufacturing_cost: hasValue ? n : null })}
          />
        </div>

        {/* Venta */}
        <div className="text-right">
          <p className="font-bold tabular-nums text-sm">{fmtMoneyShort(saleTotal)}</p>
          {isPartial && (
            <p className="text-[10px] text-muted-foreground tabular-nums" title={`Factura total: ${fmtMoney(invoiceTotal)}`}>
              de {fmtMoneyShort(invoiceTotal)}
            </p>
          )}
        </div>

        {/* Margen pill */}
        <div className="text-center">
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${cls.pill}`}>
            {margin == null ? "—" : `${margin.toFixed(0)}%`}
          </span>
        </div>

        {/* Entrega + desviación */}
        <div className="text-xs">
          <p className="tabular-nums truncate">{fmtDateShort(r.client_promised_date)}</p>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${desvDot}`} />
            {desv == null ? "—" : `${desv > 0 ? "+" : ""}${desv}d`}
          </p>
        </div>

        {/* Caret */}
        <div className="flex justify-end text-muted-foreground">
          <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </div>
      </button>

      {/* Panel expandido */}
      {expanded && (
        <ExpandedPanel row={r} suppliers={suppliers} onPatch={onPatch} />
      )}
    </div>
  );
}

function InlineSupplier({
  value, suppliers, onSave,
}: { value: string; suppliers: { id: string; name: string }[]; onSave: (v: string) => void }) {
  const current = suppliers.find((s) => s.id === value);
  return (
    <Select value={value || "__none__"} onValueChange={(v) => onSave(v === "__none__" ? "" : v)}>
      <SelectTrigger className="h-7 text-xs px-2 border-dashed bg-transparent hover:bg-background hover:border-solid">
        <span className="truncate">{current?.name ?? <span className="text-muted-foreground">— Asignar</span>}</span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Sin proveedor</SelectItem>
        {suppliers.map((s) => (
          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function InlineMoney({
  value, hasValue, onSave,
}: { value: number; hasValue: boolean; onSave: (n: number, hasValue: boolean) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(value); setEditing(true); }}
        className="w-full text-right text-sm tabular-nums px-1 py-0.5 rounded hover:bg-background border border-transparent hover:border-dashed hover:border-border"
        title="Click para editar"
      >
        {hasValue ? fmtMoneyShort(value) : <span className="text-muted-foreground text-xs italic">— Costo</span>}
      </button>
    );
  }

  const commit = () => {
    setEditing(false);
    if (draft !== value || !hasValue) onSave(draft, draft > 0);
  };
  const cancel = () => { setDraft(value); setEditing(false); };

  return (
    <MoneyInput
      autoFocus
      value={draft}
      onValueChange={setDraft}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") cancel();
      }}
      onBlur={commit}
      className="h-7 text-xs text-right tabular-nums px-1.5"
    />
  );
}

function ExpandedPanel({ row, suppliers, onPatch }: { row: any; suppliers: { id: string; name: string }[]; onPatch: (patch: Record<string, any>) => void }) {
  const r = row;
  const qc = useQueryClient();
  const desv = daysDiff(r.client_actual_date, r.client_promised_date);
  const desvCls =
    desv == null ? "text-muted-foreground"
    : desv <= 0 ? "text-emerald-700 dark:text-emerald-300"
    : desv <= 3 ? "text-amber-700 dark:text-amber-300"
    : "text-rose-700 dark:text-rose-300";

  const patchItem = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, any> }) => {
      const { error } = await (supabase.from("order_items") as any).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["production-orders-drive"] }),
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const startProd = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.rpc("start_real_production", { p_item_id: itemId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Inicio real registrado y vendedor notificado");
      qc.invalidateQueries({ queryKey: ["production-orders-drive"] });
      qc.invalidateQueries({ queryKey: ["my-tasks-count"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  return (
    <div className="border-t border-border bg-background/60 p-4 pl-5 grid md:grid-cols-[1.2fr_1fr] gap-5">
      {/* Productos detallados con fechas y botón de inicio real */}
      <div>
        <div className="flex items-center gap-2 mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Package className="h-3.5 w-3.5" /> Productos en producción
        </div>
        {(r.items?.length ?? 0) === 0 ? (
          <p className="text-xs text-muted-foreground italic">Sin productos vinculados.</p>
        ) : (
          <ul className="space-y-2">
            {r.items.map((it: any) => (
              <li key={it.id} className="rounded-lg border border-border bg-surface p-3 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium leading-tight">{firstLine(it.description) || "Producto"}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      ×{Number(it.quantity)} · {fmtMoney(Number(it.unit_price))} c/u
                      {it.production_due_date && (
                        <> · <span className="text-foreground">Entrega prod: {fmtDateShort(it.production_due_date)}</span></>
                      )}
                    </p>
                  </div>
                  <span className="text-xs font-semibold tabular-nums shrink-0">{fmtMoney(Number(it.line_total))}</span>
                </div>

                <div className="grid sm:grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Proveedor</span>
                    <select
                      value={it.supplier_id ?? ""}
                      onChange={(e) =>
                        patchItem.mutate({ id: it.id, patch: { supplier_id: e.target.value || null } })
                      }
                      className="mt-0.5 w-full bg-background border border-border hover:border-primary/50 focus:border-primary rounded-md px-2 py-1 text-xs outline-none transition-colors"
                    >
                      <option value="">— Sin proveedor</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </label>
                  <DateField
                    label="Cotización"
                    value={it.quotation_date}
                    onSave={(v) => patchItem.mutate({ id: it.id, patch: { quotation_date: v } })}
                  />
                </div>

                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                  <DateField
                    label="Prom. proveedor"
                    value={it.supplier_promised_date}
                    onSave={(v) => patchItem.mutate({ id: it.id, patch: { supplier_promised_date: v } })}
                  />
                  <DateField
                    label="Real proveedor"
                    value={it.supplier_actual_date}
                    onSave={(v) => patchItem.mutate({ id: it.id, patch: { supplier_actual_date: v } })}
                  />
                  {it.production_started_at ? (
                    <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-2 py-1.5 whitespace-nowrap">
                      📍 Iniciado {new Date(it.production_started_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startProd.mutate(it.id)}
                      disabled={startProd.isPending && startProd.variables === it.id}
                      className="text-[10px] font-semibold text-white bg-primary hover:bg-primary/90 rounded-md px-2.5 py-1.5 whitespace-nowrap inline-flex items-center gap-1 disabled:opacity-50"
                      title="Marcar que el proveedor inició la producción real (notifica al vendedor)"
                    >
                      {startProd.isPending && startProd.variables === it.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : "🚀"} Inicio real
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {r.notes && (
          <p className="mt-3 text-[11px] text-muted-foreground italic">{r.notes}</p>
        )}
      </div>

      {/* Hitos a nivel de orden */}
      <div className="space-y-3">
        <div>
          <div className="flex items-center gap-2 mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" /> Hitos de la orden
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <DateField label="Factura" value={r.invoice_date} onSave={(v) => onPatch({ invoice_date: v })} />
            <DateField label="Planimetría" value={r.planimetry_sent_date} onSave={(v) => onPatch({ planimetry_sent_date: v })} />
            <DateField label="Cotización" value={r.quotation_date} onSave={(v) => onPatch({ quotation_date: v })} />
            <DateField label="Inicio prod." value={r.production_start_date} onSave={(v) => onPatch({ production_start_date: v })} />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 italic">
            Cotización se autocompleta al asignar proveedor. Inicio prod. se sella cuando todos los productos arrancan.
          </p>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Entrega al cliente</div>
          <div className="space-y-2">
            <DateField label="Prometida" value={r.client_promised_date} onSave={(v) => onPatch({ client_promised_date: v })} />
            <DateField label="Real" value={r.client_actual_date} onSave={(v) => onPatch({ client_actual_date: v })} />
          </div>
          <div className={`mt-1 inline-flex items-center gap-1 text-[11px] font-semibold ${desvCls}`}>
            {desv != null && desv > 0 && <AlertTriangle className="h-3 w-3" />}
            {desv == null ? "Sin entrega" : `Desviación: ${desv > 0 ? "+" : ""}${desv}d`}
          </div>
        </div>
      </div>
    </div>
  );
}

function DateField({ label, value, onSave }: { label: string; value: string | null; onSave: (v: string | null) => void }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => { setV(value ?? ""); }, [value]);
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
      <input
        type="date"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const next = v || null;
          if (next !== (value ?? null)) onSave(next);
        }}
        className="mt-0.5 w-full bg-background border border-border hover:border-primary/50 focus:border-primary rounded-md px-2 py-1 text-xs outline-none transition-colors"
      />
    </label>
  );
}
