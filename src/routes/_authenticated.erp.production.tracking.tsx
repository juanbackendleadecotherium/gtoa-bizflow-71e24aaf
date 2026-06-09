import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import {
  Loader2, Factory, Search, ArrowLeft, ClipboardList, ExternalLink,
  User, Phone, Building2, Package, CalendarDays, TrendingUp, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NOVEDADES, novedadMeta } from "@/features/production/novedad-meta";

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

function daysDiff(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}

function firstLine(s: string | null | undefined) {
  if (!s) return "";
  const i = s.indexOf("\n");
  return i === -1 ? s : s.slice(0, i);
}

function TrackingPage() {
  const { brands, selectedBrandId, setSelectedBrandId, loading } = useBrand();
  const qc = useQueryClient();
  const [novedadFilter, setNovedadFilter] = useState<string>("all");
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [search, setSearch] = useState("");
  const selectedBrand = brands.find((b) => b.id === selectedBrandId);

  useEffect(() => {
    if (!selectedBrandId) return;
    const channel = supabase
      .channel(`production-tracking-${selectedBrandId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "production_orders", filter: `brand_id=eq.${selectedBrandId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["production-orders-drive"], refetchType: "all" });
          qc.invalidateQueries({ queryKey: ["production-orders-pending"], refetchType: "all" });
          qc.invalidateQueries({ queryKey: ["production-hub-counts"], refetchType: "all" });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedBrandId, qc]);

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
              .select("id, production_order_id, description, quantity, unit_price, line_total, sort_order")
              .in("production_order_id", poIds)
              .order("sort_order", { ascending: true })
          : Promise.resolve({ data: [], error: null } as any),
        sellerIds.length
          ? supabase.from("profiles").select("user_id, display_name, email").in("user_id", sellerIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      const suppliersById = new Map((suppliersRes.data ?? []).map((s: any) => [s.id, s]));
      const sellersById = new Map((sellersRes.data ?? []).map((s: any) => [s.user_id, s]));
      const itemsByPo = new Map<string, any[]>();
      for (const it of (itemsRes.data ?? []) as any[]) {
        const arr = itemsByPo.get(it.production_order_id) ?? [];
        arr.push(it);
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

  return (
    <div className="space-y-6">
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
              Cada orden muestra solo los productos enviados a producción
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

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar FAC, cliente, proveedor, vendedor…" className="pl-9" />
        </div>
        <Select value={novedadFilter} onValueChange={setNovedadFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las novedades</SelectItem>
            {NOVEDADES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {q.isLoading ? (
        <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Factory className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">Sin órdenes en seguimiento</p>
          <p className="text-xs text-muted-foreground mt-1">Acepta una orden desde "Aprobar órdenes" para que aparezca aquí.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((r: any) => (
            <TrackingCard
              key={r.id}
              row={r}
              onPatch={(patch) => updateField.mutate({ id: r.id, patch })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TrackingCard({ row, onPatch }: { row: any; onPatch: (patch: Record<string, any>) => void }) {
  const r = row;
  const saleTotal = Number(r.po_sale_total) || 0;
  const invoiceTotal = Number(r.order?.total) || 0;
  const cost = r.manufacturing_cost == null ? null : Number(r.manufacturing_cost);
  const liveMargin = cost != null && saleTotal > 0 ? ((saleTotal - cost) / saleTotal) * 100 : null;
  const margin = liveMargin ?? (r.margin_pct == null ? null : Number(r.margin_pct));

  const marginCls =
    margin == null ? "bg-muted text-muted-foreground border-border"
    : margin >= 45 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
    : margin >= 30 ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
    : "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30";

  const desv = daysDiff(r.client_actual_date, r.client_promised_date);
  const desvCls =
    desv == null ? "text-muted-foreground"
    : desv <= 0 ? "text-emerald-700 dark:text-emerald-300"
    : desv <= 3 ? "text-amber-700 dark:text-amber-300"
    : "text-rose-700 dark:text-rose-300";

  const novedad = novedadMeta(r.novedad);
  const contacto = r.order?.customer_phone || r.order?.customer_email || "—";
  const vendedor = r.seller?.display_name || r.seller?.email || "—";
  const isPartial = (r.items?.length ?? 0) > 0 && invoiceTotal > 0 && saleTotal > 0 && Math.abs(invoiceTotal - saleTotal) > 1;

  return (
    <article className="rounded-2xl border border-border bg-surface overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <header className="px-5 py-4 border-b border-border bg-gradient-to-br from-muted/40 to-transparent">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to="/erp/production/$id"
                params={{ id: r.id }}
                className="text-base font-semibold text-primary hover:underline inline-flex items-center gap-1"
              >
                {r.order?.invoice_number ? `Fact. ${r.order.invoice_number}` : r.code}
                <ExternalLink className="h-3 w-3 opacity-70" />
              </Link>
              <span className="font-mono text-[11px] text-muted-foreground">{r.code}</span>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${novedad.color}`}>
                {novedad.label}
              </span>
            </div>
            <div className="mt-2 flex gap-x-4 gap-y-1 flex-wrap text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><User className="h-3 w-3" /><span className="text-foreground font-medium">{r.order?.customer_name ?? "—"}</span></span>
              <span className="inline-flex items-center gap-1.5"><Phone className="h-3 w-3" />{contacto}</span>
              <span className="inline-flex items-center gap-1.5"><Building2 className="h-3 w-3" />Vendedor: <span className="text-foreground">{vendedor}</span></span>
            </div>
          </div>

          <div className="text-right shrink-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Venta de esta OP</p>
            <p className="text-xl font-bold tabular-nums">{fmtMoney(saleTotal)}</p>
            {isPartial && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Factura total: <span className="tabular-nums">{fmtMoney(invoiceTotal)}</span>
              </p>
            )}
            <div className="mt-1.5 flex items-center justify-end gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${marginCls}`}>
                <TrendingUp className="h-3 w-3" />
                {margin == null ? "Sin costo" : `${margin.toFixed(1)}%`}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="grid md:grid-cols-[1.2fr_1fr] divide-y md:divide-y-0 md:divide-x divide-border">
        {/* Productos */}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Package className="h-3.5 w-3.5" /> Productos en producción
          </div>
          {(r.items?.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground italic">Sin productos vinculados a esta orden.</p>
          ) : (
            <ul className="space-y-2">
              {r.items.map((it: any) => (
                <li key={it.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight truncate" title={it.description}>{firstLine(it.description) || "Producto"}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">×{Number(it.quantity)} · {fmtMoney(Number(it.unit_price))} c/u</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums shrink-0">{fmtMoney(Number(it.line_total))}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 pt-3 border-t border-border grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Proveedor</p>
              <p className="font-medium truncate" title={r.supplier?.name ?? ""}>{r.supplier?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Costo de fabricación</p>
              <p className="font-medium tabular-nums">{fmtMoney(cost)}</p>
            </div>
          </div>

          {r.notes && (
            <p className="mt-3 text-[11px] text-muted-foreground italic line-clamp-2">{r.notes}</p>
          )}
        </div>

        {/* Fechas + Novedad */}
        <div className="p-5 space-y-4 bg-muted/10">
          <div>
            <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" /> Hitos de producción
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <DateField label="Factura" value={r.invoice_date} onSave={(v) => onPatch({ invoice_date: v })} />
              <DateField label="Planimetría" value={r.planimetry_sent_date} onSave={(v) => onPatch({ planimetry_sent_date: v })} />
              <DateField label="Cotización" value={r.quotation_date} onSave={(v) => onPatch({ quotation_date: v })} />
              <DateField label="Inicio prod." value={r.production_start_date} onSave={(v) => onPatch({ production_start_date: v })} />
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Compromiso proveedor</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <DateField label="Prometida" value={r.supplier_promised_date} onSave={(v) => onPatch({ supplier_promised_date: v })} />
              <DateField label="Real" value={r.supplier_actual_date} onSave={(v) => onPatch({ supplier_actual_date: v })} />
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Entrega al cliente</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <DateField label="Prometida" value={r.client_promised_date} onSave={(v) => onPatch({ client_promised_date: v })} />
              <DateField label="Real" value={r.client_actual_date} onSave={(v) => onPatch({ client_actual_date: v })} />
            </div>
            <div className={`mt-2 inline-flex items-center gap-1 text-[11px] font-semibold ${desvCls}`}>
              {desv != null && desv > 0 && <AlertTriangle className="h-3 w-3" />}
              Desviación: {desv == null ? "—" : `${desv > 0 ? "+" : ""}${desv} día${Math.abs(desv) === 1 ? "" : "s"}`}
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium block mb-1">Novedad</label>
            <select
              value={r.novedad ?? "pendiente"}
              onChange={(e) => onPatch({ novedad: e.target.value })}
              className={`appearance-none border rounded-md px-2 py-1 text-xs font-medium cursor-pointer outline-none focus:ring-2 focus:ring-primary/40 w-full ${novedad.color}`}
            >
              {NOVEDADES.map((n) => (
                <option key={n.value} value={n.value} className="bg-background text-foreground">{n.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </article>
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
