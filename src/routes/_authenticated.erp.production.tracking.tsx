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

const DATE_FIELDS = [
  { key: "invoice_date", label: "F. FACT." },
  { key: "planimetry_sent_date", label: "PLANI." },
  { key: "quotation_date", label: "COTIZ." },
  { key: "production_start_date", label: "PRODUC." },
  { key: "supplier_promised_date", label: "ENT. PROV." },
  { key: "supplier_actual_date", label: "ENT. REAL PROV." },
  { key: "client_promised_date", label: "PROMESA CLI." },
  { key: "client_actual_date", label: "ENT. REAL CLI." },
] as const;

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

function TrackingPage() {
  const { brands, selectedBrandId, setSelectedBrandId, loading } = useBrand();
  const qc = useQueryClient();
  const [novedadFilter, setNovedadFilter] = useState<string>("all");
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [search, setSearch] = useState("");
  const selectedBrand = brands.find((b) => b.id === selectedBrandId);

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
        .in("status", ACCEPTED_STATUSES)
        .gte("created_at", from)
        .lt("created_at", to)
        .order("created_at", { ascending: false });
      if (novedadFilter !== "all") query = query.eq("novedad", novedadFilter as any);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const updateField = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, any> }) => {
      const { error } = await supabase.from("production_orders").update(patch).eq("id", id);
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
      r.order?.customer_name?.toLowerCase().includes(term),
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
          <p className="text-sm font-medium">Sin órdenes en seguimiento</p>
          <p className="text-xs text-muted-foreground mt-1">Acepta una orden desde "Aprobar órdenes" para que aparezca aquí.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                {["FAC", "PROVEEDOR", ...DATE_FIELDS.map(f => f.label), "NOVEDAD", "CLIENTE", "PRODUCCIÓN", "VENTA", "COSTO", "MARGEN"].map((h) => (
                  <th key={h} className="px-2 py-2.5 text-left font-medium whitespace-nowrap border-b border-border uppercase text-[10px] tracking-wider">
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
                    <td className="px-2 py-1.5 whitespace-nowrap font-mono">
                      <Link to="/erp/production/$id" params={{ id: r.id }} className="text-primary hover:underline">
                        {r.order?.invoice_number ?? r.code}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{r.supplier?.name ?? "—"}</td>
                    {DATE_FIELDS.map((f) => (
                      <td key={f.key} className="px-1 py-1 whitespace-nowrap">
                        <EditableDate
                          value={r[f.key]}
                          onSave={(v) => updateField.mutate({ id: r.id, patch: { [f.key]: v } })}
                        />
                      </td>
                    ))}
                    <td className="px-1 py-1 whitespace-nowrap">
                      <EditableNovedad
                        value={r.novedad}
                        onSave={(v) => updateField.mutate({ id: r.id, patch: { novedad: v } })}
                      />
                    </td>
                    <td className="px-2 py-1.5 max-w-[180px] truncate" title={r.order?.customer_name}>
                      {r.order?.customer_name ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{r.assigned_to_label ?? "—"}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-right">{fmtMoney(total)}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-right">{fmtMoney(r.manufacturing_cost)}</td>
                    <td className={`px-2 py-1.5 whitespace-nowrap text-right font-semibold ${marginColor}`}>
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
      className="bg-transparent border border-transparent hover:border-border focus:border-primary focus:bg-background rounded px-1.5 py-1 text-[11px] w-[110px] outline-none transition-colors"
    />
  );
}

function EditableNovedad({ value, onSave }: { value: string | null; onSave: (v: string) => void }) {
  const meta = novedadMeta(value);
  return (
    <select
      value={value ?? "pendiente"}
      onChange={(e) => onSave(e.target.value)}
      className={`appearance-none border rounded-full px-2 py-0.5 text-[11px] font-medium cursor-pointer outline-none focus:ring-2 focus:ring-primary/40 ${meta.color}`}
    >
      {NOVEDADES.map((n) => (
        <option key={n.value} value={n.value} className="bg-background text-foreground">{n.label}</option>
      ))}
    </select>
  );
}
