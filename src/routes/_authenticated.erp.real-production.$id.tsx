import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Save, CheckCircle2, ExternalLink, History, Trash2, Truck, ClipboardCheck, PackageCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { STAGES, PRODUCTION_STAGES, LOGISTICA_STAGES, stageMeta, DELIVERY_TARGETS, type Stage } from "@/features/real-production/meta";
import { StageBadge } from "@/features/real-production/stage-badge";
import { MarginIndicator, formatMoney } from "@/features/real-production/margin-indicator";

export const Route = createFileRoute("/_authenticated/erp/real-production/$id")({
  component: RealProductionDetail,
});

function RealProductionDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin } = useBrand();

  const rpo = useQuery({
    queryKey: ["real-production", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("real_production_orders")
        .select(`
          *,
          supplier:suppliers!supplier_id(id, name, category, phone, email, contact_name),
          order:orders!order_id(id, order_number, invoice_number, customer_name, customer_phone, customer_city, customer_address, total, notes)
        `)
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const settings = useQuery({
    queryKey: ["bps", rpo.data?.brand_id],
    enabled: !!rpo.data?.brand_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_production_settings")
        .select("min_margin_pct")
        .eq("brand_id", rpo.data!.brand_id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const minPct = Number(settings.data?.min_margin_pct ?? 45);

  const suppliers = useQuery({
    queryKey: ["suppliers", rpo.data?.brand_id],
    enabled: !!rpo.data?.brand_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers").select("id, name, category, is_active")
        .eq("brand_id", rpo.data!.brand_id).eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const audit = useQuery({
    queryKey: ["real-production-audit", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("real_production_audit_log")
        .select("*").eq("real_production_order_id", id)
        .order("created_at", { ascending: false }).limit(80);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [form, setForm] = useState({
    supplier_id: "" as string,
    supplier_cost: "" as string,
    notes: "" as string,
    delivery_target: "" as string,
  });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (rpo.data) {
      setForm({
        supplier_id: rpo.data.supplier_id ?? "",
        supplier_cost: rpo.data.supplier_cost != null ? String(rpo.data.supplier_cost) : "",
        notes: rpo.data.notes ?? "",
        delivery_target: rpo.data.delivery_target ?? "",
      });
      setDirty(false);
    }
  }, [rpo.data]);

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const liveCost = form.supplier_cost.trim() === "" ? null : Number(form.supplier_cost);
  const saleTotal = Number(rpo.data?.sale_total_snapshot ?? 0);
  const livePct = liveCost != null && !Number.isNaN(liveCost) && saleTotal > 0
    ? ((saleTotal - liveCost) / saleTotal) * 100 : null;
  const marginOk = livePct != null && livePct >= minPct;

  const saveDraft = useMutation({
    mutationFn: async () => {
      const payload: any = {
        supplier_id: form.supplier_id || null,
        supplier_cost: form.supplier_cost.trim() === "" ? null : Number(form.supplier_cost),
        notes: form.notes || null,
        delivery_target: form.delivery_target || null,
      };
      const { error } = await supabase.from("real_production_orders").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cambios guardados");
      qc.invalidateQueries({ queryKey: ["real-production", id] });
      qc.invalidateQueries({ queryKey: ["real-production-audit", id] });
      setDirty(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const advance = useMutation({
    mutationFn: async (next: Stage) => {
      const patch: any = { stage: next };
      if (next === "aprobado") patch.supplier_approved = true;
      const { error } = await supabase.from("real_production_orders").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, next) => {
      toast.success(`Etapa actualizada: ${stageMeta(next).label}`);
      qc.invalidateQueries({ queryKey: ["real-production", id] });
      qc.invalidateQueries({ queryKey: ["real-production-audit", id] });
      qc.invalidateQueries({ queryKey: ["real-production-list"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const togglePlanimetryOk = useMutation({
    mutationFn: async (v: boolean) => {
      const { error } = await supabase.from("real_production_orders")
        .update({ planimetry_ok: v, stage: v ? "proveedor" : "planimetria" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["real-production", id] });
      qc.invalidateQueries({ queryKey: ["real-production-audit", id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const toggleQc = useMutation({
    mutationFn: async (v: boolean) => {
      const { error } = await supabase.from("real_production_orders")
        .update({ qc_ok: v, stage: v ? "entrega" : "control_calidad" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["real-production", id] });
      qc.invalidateQueries({ queryKey: ["real-production-audit", id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("real_production_orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orden eliminada");
      navigate({ to: "/erp/real-production/produccion" });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  if (rpo.isLoading) {
    return <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" /></div>;
  }
  if (!rpo.data) return <p className="text-sm text-muted-foreground">No encontrada.</p>;

  const p = rpo.data;
  const order = p.order as any;
  const inLogistica = LOGISTICA_STAGES.includes(p.stage as Stage);

  const handleApprove = () => {
    if (!form.supplier_id) { toast.error("Selecciona un proveedor"); return; }
    if (form.supplier_cost.trim() === "") { toast.error("Registra el costo del proveedor"); return; }
    if (!marginOk) { toast.error(`Margen ${livePct?.toFixed(1)}% por debajo del mínimo ${minPct}%. Renegocia.`); return; }
    // Save first then advance
    saveDraft.mutateAsync().then(() => advance.mutate("aprobado"));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link to="/erp/real-production/produccion" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
            <ArrowLeft className="h-3 w-3" /> Volver
          </Link>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-3 flex-wrap">
            <span className="font-mono">{p.code}</span>
            <StageBadge stage={p.stage} />
          </h1>
          {order && (
            <Link to="/erp/orders/$id" params={{ id: order.id }}
              className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mt-1">
              Venta {order.order_number} · {order.customer_name} <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => {
              if (confirm("¿Eliminar definitivamente esta orden de producción real?")) remove.mutate();
            }} className="text-destructive gap-1">
              <Trash2 className="h-4 w-4" /> Eliminar
            </Button>
          )}
          <Button size="sm" onClick={() => saveDraft.mutate()} disabled={!dirty || saveDraft.isPending} className="gap-1">
            {saveDraft.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
          </Button>
        </div>
      </div>

      {/* Stepper */}
      <Stepper current={p.stage} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* 1. Planimetría */}
          {!inLogistica && (
            <section className="rounded-xl border border-border bg-surface p-5 space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">1 · Revisar planimetría</h2>
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox checked={!!p.planimetry_ok} onCheckedChange={(v) => togglePlanimetryOk.mutate(!!v)} />
                <span className="text-sm">La planimetría de la venta está correcta y lista para cotizar con proveedor.</span>
              </label>
              {order?.notes && (
                <p className="text-xs text-muted-foreground border-t border-border pt-2">
                  Notas de la venta: {order.notes}
                </p>
              )}
            </section>
          )}

          {/* 2. Proveedor + costo + margen */}
          {!inLogistica && (
            <section className="rounded-xl border border-border bg-surface p-5 space-y-4">
              <h2 className="text-sm font-medium text-muted-foreground">2 · Selección de proveedor y negociación</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Proveedor</Label>
                  <Select value={form.supplier_id} onValueChange={(v) => update("supplier_id", v)} disabled={!p.planimetry_ok}>
                    <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>
                      {(suppliers.data ?? []).length === 0 ? (
                        <div className="p-3 text-xs text-muted-foreground">
                          Sin proveedores. <Link to="/erp/settings/suppliers" className="text-primary underline">Agregar</Link>
                        </div>
                      ) : (
                        (suppliers.data ?? []).map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}{s.category ? ` · ${s.category}` : ""}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Costo proveedor (COP)</Label>
                  <Input type="number" min={0} step={1} value={form.supplier_cost}
                    onChange={(e) => update("supplier_cost", e.target.value)} disabled={!p.planimetry_ok}
                    placeholder="0" />
                </div>
              </div>

              <MarginIndicator saleTotal={saleTotal} supplierCost={liveCost} minPct={minPct} />

              <div className="flex gap-2 flex-wrap">
                {p.stage === "proveedor" && form.supplier_id && (
                  <Button size="sm" variant="outline" onClick={() => saveDraft.mutateAsync().then(() => advance.mutate("negociacion"))}>
                    Pasar a negociación
                  </Button>
                )}
                {(p.stage === "proveedor" || p.stage === "negociacion") && (
                  <Button size="sm" onClick={handleApprove}
                    disabled={!form.supplier_id || !marginOk || advance.isPending}
                    className="gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Aprobar proveedor
                  </Button>
                )}
                {p.stage === "aprobado" && (
                  <Button size="sm" onClick={() => advance.mutate("seguimiento")} className="gap-1">
                    Iniciar seguimiento
                  </Button>
                )}
              </div>
            </section>
          )}

          {/* 3. Seguimiento / terminar */}
          {!inLogistica && (p.stage === "seguimiento" || p.stage === "aprobado") && (
            <section className="rounded-xl border border-border bg-surface p-5 space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">3 · Seguimiento de producción</h2>
              <p className="text-xs text-muted-foreground">
                Mantente en contacto con el proveedor y registra observaciones aquí. Cuando esté listo, marca como terminado para pasarlo a Logística.
              </p>
              <Button size="sm" onClick={() => advance.mutate("terminado")} disabled={advance.isPending} className="gap-1">
                <PackageCheck className="h-4 w-4" /> Marcar terminado → enviar a Logística
              </Button>
            </section>
          )}

          {p.stage === "terminado" && (
            <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3">
              <h2 className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Producto terminado</h2>
              <p className="text-xs">Pasa a Logística para iniciar el control de calidad.</p>
              <Button size="sm" onClick={() => advance.mutate("control_calidad")} className="gap-1">
                <Truck className="h-4 w-4" /> Enviar a Logística
              </Button>
            </section>
          )}

          {/* Logística */}
          {inLogistica && (
            <section className="rounded-xl border border-border bg-surface p-5 space-y-4">
              <h2 className="text-sm font-medium text-muted-foreground">Logística</h2>
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox checked={!!p.qc_ok} onCheckedChange={(v) => toggleQc.mutate(!!v)} />
                <span className="text-sm flex items-center gap-1"><ClipboardCheck className="h-4 w-4" /> Control de calidad aprobado</span>
              </label>

              <div>
                <Label className="text-xs">Destino de entrega</Label>
                <Select value={form.delivery_target} onValueChange={(v) => update("delivery_target", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {DELIVERY_TARGETS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {order?.customer_address && (
                <p className="text-xs text-muted-foreground border-t border-border pt-2">
                  Dirección cliente: {order.customer_address}{order.customer_city ? `, ${order.customer_city}` : ""}
                </p>
              )}

              <div className="flex gap-2 flex-wrap">
                {p.stage === "entrega" && (
                  <Button size="sm" onClick={() => saveDraft.mutateAsync().then(() => advance.mutate("entregado"))}
                    disabled={!form.delivery_target} className="gap-1">
                    <PackageCheck className="h-4 w-4" /> Marcar entregado
                  </Button>
                )}
                {p.stage === "entregado" && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">✓ Entregado el {p.delivered_at ? new Date(p.delivered_at).toLocaleString("es-CO") : "—"}</p>
                )}
              </div>
            </section>
          )}

          {/* Notas */}
          <section className="rounded-xl border border-border bg-surface p-5 space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">Notas internas</h2>
            <Textarea rows={3} value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Observaciones, acuerdos con proveedor, detalles de entrega…" />
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          <section className="rounded-xl border border-border bg-surface p-5 space-y-2 text-sm">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Resumen</h2>
            <div className="flex justify-between"><span className="text-muted-foreground">Total venta</span><span className="font-medium">{formatMoney(saleTotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Costo proveedor</span><span className="font-medium">{formatMoney(p.supplier_cost as any)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Margen</span>
              <span className={`font-semibold ${p.margin_pct == null ? "" : Number(p.margin_pct) >= minPct ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {p.margin_pct == null ? "—" : `${Number(p.margin_pct).toFixed(1)}%`}
              </span>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Mínimo marca</span><span>{minPct}%</span></div>
          </section>

          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-3">
              <History className="h-4 w-4" /> Bitácora
            </h2>
            {audit.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (audit.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin movimientos.</p>
            ) : (
              <ol className="space-y-3">
                {(audit.data ?? []).map((a: any) => (
                  <li key={a.id} className="text-xs border-l-2 border-border pl-3">
                    <p className="font-medium text-foreground">
                      {a.action === "create" ? "Orden creada"
                        : a.action === "stage" ? `Etapa → ${stageMeta(a.new_value).label}`
                        : a.field ? `${a.field}: ${JSON.stringify(a.new_value)}`
                        : a.action}
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      {new Date(a.created_at).toLocaleString("es-CO")}
                      {a.changed_by_email && ` · ${a.changed_by_email}`}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Stepper({ current }: { current: string }) {
  const flow: Stage[] = [...PRODUCTION_STAGES.filter((s) => s !== "terminado"), "terminado", ...LOGISTICA_STAGES];
  const currentIdx = useMemo(() => flow.indexOf(current as Stage), [flow, current]);
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {flow.map((s, i) => {
        const meta = stageMeta(s);
        const active = i === currentIdx;
        const done = i < currentIdx;
        return (
          <div key={s} className="flex items-center gap-1 shrink-0">
            <div className={`px-2.5 py-1 rounded-md text-[11px] font-medium border ${
              active ? "bg-primary text-primary-foreground border-primary"
              : done ? "bg-muted text-foreground border-border"
              : "bg-background text-muted-foreground border-border"
            }`}>
              {meta.label}
            </div>
            {i < flow.length - 1 && <span className="text-muted-foreground/40">›</span>}
          </div>
        );
      })}
    </div>
  );
}
