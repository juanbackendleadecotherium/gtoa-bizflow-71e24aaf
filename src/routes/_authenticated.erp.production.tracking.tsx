import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { Loader2, Factory, Search, ArrowLeft, ClipboardList } from "lucide-react";
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
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.round((da - db) / 86400000);
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

      const supplierIds = Array.from(new Set(rows.map((r) => r.supplier_id).filter(Boolean)));
      const orderIds = Array.from(new Set(rows.map((r) => r.order_id).filter(Boolean)));
      const sellerIds = Array.from(new Set(rows.map((r) => r.order?.seller_id).filter(Boolean)));

      const [suppliersRes, itemsRes, sellersRes] = await Promise.all([
        supplierIds.length
          ? supabase.from("suppliers").select("id, name").in("id", supplierIds)
          : Promise.resolve({ data: [], error: null } as any),
        orderIds.length
          ? supabase.from("order_items").select("order_id, description, sort_order").in("order_id", orderIds).order("sort_order", { ascending: true })
          : Promise.resolve({ data: [], error: null } as any),
        sellerIds.length
          ? supabase.from("profiles").select("user_id, display_name, email").in("user_id", sellerIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      const suppliersById = new Map((suppliersRes.data ?? []).map((s: any) => [s.id, s]));
      const sellersById = new Map((sellersRes.data ?? []).map((s: any) => [s.user_id, s]));
      const itemsByOrder = new Map<string, any[]>();
      for (const it of (itemsRes.data ?? []) as any[]) {
        const arr = itemsByOrder.get(it.order_id) ?? [];
        arr.push(it);
        itemsByOrder.set(it.order_id, arr);
      }

      return rows.map((r) => ({
        ...r,
        supplier: suppliersById.get(r.supplier_id) ?? null,
        items: itemsByOrder.get(r.order_id) ?? [],
        seller: r.order?.seller_id ? sellersById.get(r.order.seller_id) ?? null : null,
      }));
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
              Hoja estilo Drive — fechas y novedades editables en línea
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
        <div className="rounded-xl border border-border bg-surface overflow-x-auto">
          <table className="w-full text-[11px] table-fixed">
            <colgroup>
              <col style={{ width: 90 }} />
              <col style={{ width: 150 }} />
              <col />
              <col style={{ width: 110 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 110 }} />
            </colgroup>
            <thead className="bg-muted/40 text-muted-foreground">
              <tr className="text-[10px] uppercase tracking-wider">
                <Th>FAC<br/><span className="text-muted-foreground/70 normal-case font-normal">Vendedor</span></Th>
                <Th>Cliente<br/><span className="text-muted-foreground/70 normal-case font-normal">Contacto</span></Th>
                <Th>Producto<br/><span className="text-muted-foreground/70 normal-case font-normal">Observación</span></Th>
                <Th>Proveedor</Th>
                <Th>F. Factura</Th>
                <Th>Planimetría</Th>
                <Th>Cotización</Th>
                <Th>SLA Producción</Th>
                <Th>Ent. Prov.<br/><span className="text-muted-foreground/70 normal-case font-normal">Real Prov.</span></Th>
                <Th>Promesa Cli.<br/><span className="text-muted-foreground/70 normal-case font-normal">Real Cli.</span></Th>
                <Th>Desviación<br/><span className="text-muted-foreground/70 normal-case font-normal">Novedad</span></Th>
                <Th className="text-right">Venta / Costo<br/><span className="text-muted-foreground/70 normal-case font-normal">Margen</span></Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: any) => {
                const total = Number(r.order?.total) || 0;
                const margin = r.margin_pct == null ? null : Number(r.margin_pct);
                const marginColor =
                  margin == null ? "text-muted-foreground"
                  : margin >= 45 ? "text-emerald-600 dark:text-emerald-400"
                  : margin >= 30 ? "text-amber-600 dark:text-amber-400"
                  : "text-rose-600 dark:text-rose-400";

                const desv = daysDiff(r.client_actual_date, r.client_promised_date);
                const desvColor =
                  desv == null ? "text-muted-foreground"
                  : desv <= 0 ? "text-emerald-600 dark:text-emerald-400"
                  : desv <= 3 ? "text-amber-600 dark:text-amber-400"
                  : "text-rose-600 dark:text-rose-400";
                const desvLabel = desv == null ? "—" : `${desv > 0 ? "+" : ""}${desv}d`;

                const productos = (r.items ?? []).map((it: any) => it.description).filter(Boolean);
                const productoMain = productos[0] ?? "—";
                const productoExtra = productos.length > 1 ? ` +${productos.length - 1}` : "";

                const contacto = r.order?.customer_phone || r.order?.customer_email || "—";
                const vendedor = r.seller?.display_name || r.seller?.email || "—";

                return (
                  <tr key={r.id} className="border-b border-border hover:bg-muted/20 transition-colors align-top">
                    {/* FAC + Vendedor */}
                    <td className="px-2 py-1.5">
                      <Link to="/erp/production/$id" params={{ id: r.id }} className="text-primary hover:underline font-mono text-[11px] block truncate">
                        {r.order?.invoice_number ?? r.code}
                      </Link>
                      <div className="text-[10px] text-muted-foreground truncate" title={vendedor}>{vendedor}</div>
                    </td>

                    {/* Cliente + Contacto */}
                    <td className="px-2 py-1.5">
                      <div className="truncate font-medium" title={r.order?.customer_name}>{r.order?.customer_name ?? "—"}</div>
                      <div className="text-[10px] text-muted-foreground truncate" title={contacto}>{contacto}</div>
                    </td>

                    {/* Producto + Observación */}
                    <td className="px-2 py-1.5">
                      <div className="truncate" title={productos.join(" · ")}>
                        {productoMain}{productoExtra && <span className="text-muted-foreground">{productoExtra}</span>}
                      </div>
                      <div className="text-[10px] text-muted-foreground line-clamp-2" title={r.notes ?? ""}>
                        {r.notes || "—"}
                      </div>
                    </td>

                    {/* Proveedor */}
                    <td className="px-2 py-1.5 truncate" title={r.supplier?.name ?? ""}>{r.supplier?.name ?? "—"}</td>

                    {/* Fechas individuales */}
                    <td className="px-1 py-1"><EditableDate value={r.invoice_date} onSave={(v) => updateField.mutate({ id: r.id, patch: { invoice_date: v } })} /></td>
                    <td className="px-1 py-1"><EditableDate value={r.planimetry_sent_date} onSave={(v) => updateField.mutate({ id: r.id, patch: { planimetry_sent_date: v } })} /></td>
                    <td className="px-1 py-1"><EditableDate value={r.quotation_date} onSave={(v) => updateField.mutate({ id: r.id, patch: { quotation_date: v } })} /></td>
                    <td className="px-1 py-1"><EditableDate value={r.production_start_date} onSave={(v) => updateField.mutate({ id: r.id, patch: { production_start_date: v } })} /></td>

                    {/* Ent Prov / Real Prov apilados */}
                    <td className="px-1 py-1 space-y-1">
                      <EditableDate value={r.supplier_promised_date} onSave={(v) => updateField.mutate({ id: r.id, patch: { supplier_promised_date: v } })} />
                      <EditableDate value={r.supplier_actual_date} onSave={(v) => updateField.mutate({ id: r.id, patch: { supplier_actual_date: v } })} />
                    </td>

                    {/* Promesa Cli / Real Cli apilados */}
                    <td className="px-1 py-1 space-y-1">
                      <EditableDate value={r.client_promised_date} onSave={(v) => updateField.mutate({ id: r.id, patch: { client_promised_date: v } })} />
                      <EditableDate value={r.client_actual_date} onSave={(v) => updateField.mutate({ id: r.id, patch: { client_actual_date: v } })} />
                    </td>

                    {/* Desviación + Novedad apilados */}
                    <td className="px-1 py-1 space-y-1">
                      <div className={`text-[11px] font-semibold text-center ${desvColor}`}>{desvLabel}</div>
                      <EditableNovedad value={r.novedad} onSave={(v) => updateField.mutate({ id: r.id, patch: { novedad: v } })} />
                    </td>

                    {/* Venta / Costo / Margen */}
                    <td className="px-2 py-1.5 text-right">
                      <div className="font-medium tabular-nums">{fmtMoney(total)}</div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">{fmtMoney(r.manufacturing_cost)}</div>
                      <div className={`text-[11px] font-semibold tabular-nums ${marginColor}`}>
                        {margin == null ? "—" : `${margin.toFixed(0)}%`}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-2 py-2 text-left font-medium border-b border-border leading-tight ${className}`}>
      {children}
    </th>
  );
}

function EditableDate({ value, onSave }: { value: string | null; onSave: (v: string | null) => void }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => { setV(value ?? ""); }, [value]);
  return (
    <input
      type="date"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const next = v || null;
        if (next !== (value ?? null)) onSave(next);
      }}
      className="bg-transparent border border-transparent hover:border-border focus:border-primary focus:bg-background rounded px-1 py-0.5 text-[10px] w-full outline-none transition-colors"
    />
  );
}

function EditableNovedad({ value, onSave }: { value: string | null; onSave: (v: string) => void }) {
  const meta = novedadMeta(value);
  return (
    <select
      value={value ?? "pendiente"}
      onChange={(e) => onSave(e.target.value)}
      className={`appearance-none border rounded-full px-1.5 py-0.5 text-[10px] font-medium cursor-pointer outline-none focus:ring-2 focus:ring-primary/40 w-full text-center ${meta.color}`}
    >
      {NOVEDADES.map((n) => (
        <option key={n.value} value={n.value} className="bg-background text-foreground">{n.label}</option>
      ))}
    </select>
  );
}
