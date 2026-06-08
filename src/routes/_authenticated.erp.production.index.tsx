import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, Factory, Search, Check, ShieldAlert, Inbox, Clock, CheckCircle2, AlertCircle } from "lucide-react";
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

// Statuses that flow into the Drive-style tracking table (accepted)
const ACCEPTED_STATUSES = ["en_proceso", "control_calidad", "listo", "entregado"];

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function timeAgo(d: string | null | undefined) {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "hace un momento";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const dd = Math.floor(h / 24);
  return `hace ${dd} d`;
}

function ProductionList() {
  const { brands, selectedBrandId, setSelectedBrandId, loading } = useBrand();
  const qc = useQueryClient();
  const [novedadFilter, setNovedadFilter] = useState<string>("all");
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [search, setSearch] = useState("");
  const [rejectTarget, setRejectTarget] = useState<{ id: string; code: string } | null>(null);
  const selectedBrand = brands.find((b) => b.id === selectedBrandId);

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
  const enProcesoCount = (q.data ?? []).filter((r: any) => r.status === "en_proceso").length;
  const listoCount = (q.data ?? []).filter((r: any) => r.status === "listo" || r.status === "entregado").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
            <Factory className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold">Producción</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Aprueba las órdenes que envían los vendedores y haz seguimiento del flujo.
            </p>
          </div>
        </div>
      </div>

      {/* Brand tabs */}
      {!loading && brands.length > 0 && (
        <div className="flex gap-1 border-b border-border overflow-x-auto -mx-1 px-1">
          {brands.map((b) => {
            const active = b.id === selectedBrandId;
            return (
              <button
                key={b.id}
                onClick={() => setSelectedBrandId(b.id)}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="inline-block h-2 w-2 rounded-full mr-2" style={{ background: b.primary_color }} />
                {b.slug.toUpperCase()} · {year}
              </button>
            );
          })}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Inbox} label="Por revisar" value={pendingCount} tone="amber" pulse={pendingCount > 0} />
        <StatCard icon={Clock} label="En proceso" value={enProcesoCount} tone="blue" />
        <StatCard icon={CheckCircle2} label="Listos / entregados" value={listoCount} tone="emerald" />
        <StatCard icon={AlertCircle} label="Total seguimiento" value={(q.data ?? []).length} tone="slate" />
      </div>

      {/* Pending review — visually distinct: warm tint, separated, prominent */}
      <section className={`rounded-xl border bg-surface overflow-hidden transition-shadow ${
        pendingCount > 0
          ? "border-amber-500/40 shadow-[0_0_0_3px_rgb(245_158_11_/_0.08)]"
          : "border-border"
      }`}>
        <div className={`px-5 py-3.5 border-b flex items-center justify-between gap-2 flex-wrap ${
          pendingCount > 0
            ? "border-amber-500/30 bg-amber-500/10"
            : "border-border bg-muted/30"
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`h-8 w-8 rounded-lg grid place-items-center ${
              pendingCount > 0
                ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                : "bg-muted text-muted-foreground"
            }`}>
              <Inbox className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold leading-tight">Por revisar</h2>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                Acepta para iniciar producción o rechaza con motivo para devolver al vendedor.
              </p>
            </div>
            {pendingCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs font-bold bg-amber-500 text-white shadow-sm">
                {pendingCount}
              </span>
            )}
          </div>
        </div>
        {pending.isLoading ? (
          <div className="py-10 text-center"><Loader2 className="h-4 w-4 animate-spin inline text-muted-foreground" /></div>
        ) : pendingCount === 0 ? (
          <div className="px-5 py-10 text-center">
            <CheckCircle2 className="h-7 w-7 text-emerald-500/70 mx-auto mb-2" />
            <p className="text-sm font-medium">Todo al día</p>
            <p className="text-xs text-muted-foreground mt-1">No hay órdenes pendientes de revisión.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {(pending.data ?? []).map((r: any) => (
              <li key={r.id} className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap hover:bg-muted/20 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link to="/erp/production/$id" params={{ id: r.id }}
                      className="text-sm font-semibold font-mono text-primary hover:underline">
                      {r.code}
                    </Link>
                    <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {timeAgo(r.created_at)}
                    </span>
                  </div>
                  <p className="text-sm mt-1 truncate">
                    <span className="text-muted-foreground">Venta</span>{" "}
                    <span className="font-medium">{r.order?.order_number ?? "—"}</span>
                    <span className="text-muted-foreground"> · </span>
                    <span>{r.order?.customer_name ?? "—"}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{fmtMoney(r.order?.total)}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm"
                    onClick={() => setRejectTarget({ id: r.id, code: r.code })}
                    className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10">
                    <ShieldAlert className="h-3.5 w-3.5" /> Rechazar
                  </Button>
                  <Button size="sm" onClick={() => accept.mutate(r.id)}
                    disabled={accept.isPending} className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
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

      {/* Visual separator */}
      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
        <div className="relative flex justify-center">
          <span className="bg-background px-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Seguimiento aceptado
          </span>
        </div>
      </div>

      {/* Drive-style tracking */}
      <section>
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <div>
            <h2 className="text-base font-semibold">Seguimiento de producción</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Órdenes aceptadas, en formato hoja del Drive
              {selectedBrand ? ` — ${selectedBrand.name}` : ""}.
            </p>
          </div>
        </div>

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
            <p className="text-xs text-muted-foreground mt-1">Acepta una orden de "Por revisar" para que aparezca aquí.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground sticky top-0">
                <tr>
                  {[
                    "FAC", "PROVEEDOR", "F. FACT.", "PLANI.", "COTIZ.", "PRODUC.",
                    "ENT. PROV.", "ENT. REAL PROV.", "PROMESA CLI.", "ENT. REAL CLI.",
                    "NOVEDAD", "CLIENTE", "PRODUCCIÓN", "VENTA", "COSTO", "MARGEN",
                  ].map((h) => (
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
      </section>
    </div>
  );
}

const TONES: Record<string, string> = {
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  slate: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20",
};

function StatCard({
  icon: Icon, label, value, tone, pulse,
}: { icon: any; label: string; value: number; tone: keyof typeof TONES; pulse?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 flex items-center gap-3">
      <div className={`h-9 w-9 rounded-lg grid place-items-center border ${TONES[tone]} ${pulse ? "animate-pulse" : ""}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground leading-tight">{label}</p>
        <p className="text-xl font-semibold font-display leading-tight mt-0.5">{value}</p>
      </div>
    </div>
  );
}
