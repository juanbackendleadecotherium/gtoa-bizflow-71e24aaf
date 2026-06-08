import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, Factory, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NOVEDADES, NovedadBadge } from "@/features/production/novedad-meta";

export const Route = createFileRoute("/_authenticated/erp/production/")({
  head: () => ({ meta: [{ title: "Producción — Grupo Getova" }] }),
  component: ProductionList,
});

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR + 1, CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function ProductionList() {
  const { brands, selectedBrandId, setSelectedBrandId, loading } = useBrand();
  const [novedadFilter, setNovedadFilter] = useState<string>("all");
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["production-orders-drive", selectedBrandId, novedadFilter, year],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const from = `${year}-01-01`;
      const to = `${year + 1}-01-01`;
      let query = supabase
        .from("production_orders")
        .select(`
          id, code, novedad, status, manufacturing_cost, margin_pct,
          invoice_date, planimetry_sent_date, quotation_date, production_start_date,
          supplier_promised_date, supplier_actual_date, client_promised_date, client_actual_date,
          assigned_to_label, notes, created_at,
          supplier:suppliers!supplier_id(id, name),
          order:orders!order_id(id, order_number, invoice_number, customer_name, total)
        `)
        .eq("brand_id", selectedBrandId!)
        .gte("created_at", from)
        .lt("created_at", to)
        .order("created_at", { ascending: false });
      if (novedadFilter !== "all") query = query.eq("novedad", novedadFilter as any);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
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
      r.order?.customer_name?.toLowerCase().includes(term),
    );
  }, [q.data, search]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
          <Factory className="h-5 w-5 text-primary" /> Producción
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Seguimiento por marca y año, replicando las hojas del Drive.
        </p>
      </div>

      {/* Brand tabs like Drive sheets */}
      {!loading && brands.length > 0 && (
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {brands.map((b) => {
            const active = b.id === selectedBrandId;
            return (
              <button
                key={b.id}
                onClick={() => setSelectedBrandId(b.id)}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="inline-block h-2 w-2 rounded-full mr-2" style={{ background: b.primary_color }} />
                PRODUCCION {b.slug.toUpperCase()} {year}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar FAC, cliente, proveedor, código…" className="pl-9" />
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
          <p className="text-sm font-medium">Sin órdenes de producción</p>
          <p className="text-xs text-muted-foreground mt-1">Crea una desde el detalle de una venta.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                {[
                  "FAC", "PROVEEDOR", "F. FACT.", "PLANI.", "COTIZ.", "PRODUC.",
                  "ENT. PROV.", "ENT. REAL PROV.", "PROMESA CLI.", "ENT. REAL CLI.",
                  "NOVEDAD", "CLIENTE", "PRODUCCIÓN", "VENTA", "COSTO", "MARGEN",
                ].map((h) => (
                  <th key={h} className="px-2 py-2 text-left font-medium whitespace-nowrap border-b border-border">
                    {h}
                  </th>
                ))}
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
                return (
                  <tr key={r.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                    <td className="px-2 py-2 whitespace-nowrap font-mono">
                      <Link to="/erp/production/$id" params={{ id: r.id }} className="text-primary hover:underline">
                        {r.order?.invoice_number ?? r.code}
                      </Link>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{r.supplier?.name ?? "—"}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{fmtDate(r.invoice_date)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{fmtDate(r.planimetry_sent_date)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{fmtDate(r.quotation_date)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{fmtDate(r.production_start_date)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{fmtDate(r.supplier_promised_date)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{fmtDate(r.supplier_actual_date)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{fmtDate(r.client_promised_date)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{fmtDate(r.client_actual_date)}</td>
                    <td className="px-2 py-2 whitespace-nowrap"><NovedadBadge value={r.novedad} /></td>
                    <td className="px-2 py-2 max-w-[180px] truncate" title={r.order?.customer_name}>
                      {r.order?.customer_name ?? "—"}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{r.assigned_to_label ?? "—"}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-right">{fmtMoney(total)}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-right">{fmtMoney(r.manufacturing_cost)}</td>
                    <td className={`px-2 py-2 whitespace-nowrap text-right font-semibold ${marginColor}`}>
                      {margin == null ? "—" : `${margin.toFixed(0)}%`}
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
