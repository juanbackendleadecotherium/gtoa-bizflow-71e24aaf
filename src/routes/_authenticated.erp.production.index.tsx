import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, Factory, Search, Check, ShieldAlert, Inbox } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NOVEDADES, NovedadBadge } from "@/features/production/novedad-meta";
import { ReasonDialog } from "@/features/production/reason-dialog";

export const Route = createFileRoute("/_authenticated/erp/production/")({
  head: () => ({ meta: [{ title: "Producción — Grupo Getova" }] }),
  component: ProductionList,
});

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR + 1, CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

// Statuses that count as "accepted" — these flow into the Drive tracking table
const ACCEPTED_STATUSES = ["en_proceso", "control_calidad", "listo", "entregado"];

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("es-CO", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function ProductionList() {
  const { brands, selectedBrandId, setSelectedBrandId, loading } = useBrand();
  const qc = useQueryClient();
  const [novedadFilter, setNovedadFilter] = useState<string>("all");
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [search, setSearch] = useState("");
  const [rejectTarget, setRejectTarget] = useState<{ id: string; code: string } | null>(null);

  // Pending review queue — orders sellers just sent
  const pending = useQuery({
    queryKey: ["production-orders-pending", selectedBrandId],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_orders")
        .select(`
          id, code, status, created_at, notes,
          order:orders!order_id(id, order_number, invoice_number, customer_name, total, seller_id)
        `)
        .eq("brand_id", selectedBrandId!)
        .eq("status", "pendiente")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Accepted orders — Drive-style tracking
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

  const accept = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("production_orders")
        .update({ status: "en_proceso", novedad: "produccion" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orden aceptada — pasa a seguimiento");
      qc.invalidateQueries({ queryKey: ["production-orders-pending"] });
      qc.invalidateQueries({ queryKey: ["production-orders-drive"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("reject_production_with_reason", { p_id: id, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orden rechazada — se creó tarea al vendedor");
      setRejectTarget(null);
      qc.invalidateQueries({ queryKey: ["production-orders-pending"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
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

  const pendingCount = pending.data?.length ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
          <Factory className="h-5 w-5 text-primary" /> Producción
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Revisa las órdenes que envían los vendedores y haz seguimiento por marca y año.
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

      {/* Pending review queue */}
      <section className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2 bg-muted/30">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Por revisar</h2>
            {pendingCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-medium bg-primary text-primary-foreground">
                {pendingCount}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">Acepta o rechaza para pasar a seguimiento</p>
        </div>
        {pending.isLoading ? (
          <div className="py-8 text-center"><Loader2 className="h-4 w-4 animate-spin inline text-muted-foreground" /></div>
        ) : pendingCount === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            No hay órdenes pendientes de revisión.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {(pending.data ?? []).map((r: any) => (
              <li key={r.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap hover:bg-muted/20">
                <div className="min-w-0 flex-1">
                  <Link to="/erp/production/$id" params={{ id: r.id }}
                    className="text-sm font-medium font-mono text-primary hover:underline">
                    {r.code}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    Venta {r.order?.order_number ?? "—"} · {r.order?.customer_name ?? "—"} · {fmtMoney(r.order?.total)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Enviada: {fmtDateTime(r.created_at)}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm"
                    onClick={() => setRejectTarget({ id: r.id, code: r.code })}
                    className="gap-1 text-amber-700 dark:text-amber-300">
                    <ShieldAlert className="h-3.5 w-3.5" /> Rechazar
                  </Button>
                  <Button size="sm" onClick={() => accept.mutate(r.id)}
                    disabled={accept.isPending} className="gap-1">
                    <Check className="h-3.5 w-3.5" /> Aceptar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ReasonDialog
        open={!!rejectTarget}
        onOpenChange={(v) => !v && setRejectTarget(null)}
        title={`Rechazar ${rejectTarget?.code ?? ""}`}
        description="La orden se marcará como rechazada y se creará una tarea para que el vendedor corrija la planimetría."
        confirmLabel="Rechazar"
        pending={reject.isPending}
        onConfirm={(r) => rejectTarget && reject.mutate({ id: rejectTarget.id, reason: r })}
      />

      {/* Drive-style tracking */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Seguimiento de producción</h2>
        <div className="flex gap-2 flex-wrap mb-3">
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
            <p className="text-xs text-muted-foreground mt-1">Acepta una orden de la lista de arriba para que aparezca aquí.</p>
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
    </div>
  );
}
