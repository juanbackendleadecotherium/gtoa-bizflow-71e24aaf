import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Save, Trash2, History, ExternalLink, ShieldAlert, RefreshCw, Check, XCircle } from "lucide-react";
import { generatePlanimetryForOrder } from "@/features/production/send-to-production-button";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { PRODUCTION_STATUSES } from "@/features/production/production-meta";
import { ProductionStatusBadge } from "@/features/production/status-badge";
import { PlanimetryUploader, type Planimetry } from "@/features/production/planimetry-uploader";
import { ReasonDialog } from "@/features/production/reason-dialog";
import { ItemMarginsSection } from "@/features/production/item-margins-section";
import { AuditTimeline } from "@/features/production/audit-timeline";
import { isProductionLocked } from "@/features/production/seller-restrictions";

export const Route = createFileRoute("/_authenticated/erp/production/$id")({
  component: ProductionDetail,
});

function ProductionDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin, roles } = useBrand();
  const isProduction = isAdmin || roles.includes("operativo");
  const isSellerOnly = !isProduction && roles.includes("ventas");



  const prod = useQuery({
    queryKey: ["production-order", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_orders")
        .select(`
          *,
          order:orders!order_id(id, order_number, invoice_number, customer_name, total, status:order_statuses(name, color))
        `)
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const plan = useQuery({
    queryKey: ["planimetries", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("production_planimetries")
        .select("*, order_item:order_items!order_item_id(id, description)")
        .eq("production_order_id", id).order("version", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Planimetry[];
    },
  });

  const audit = useQuery({
    queryKey: ["production-audit", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("production_audit_log")
        .select("*").eq("production_order_id", id).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [form, setForm] = useState({
    status: "pendiente",
    assigned_to_label: "",
    due_date: "",
    notes: "",
  });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (prod.data) {
      const d: any = prod.data;
      setForm({
        status: d.status ?? "pendiente",
        assigned_to_label: d.assigned_to_label ?? "",
        due_date: d.due_date ?? "",
        notes: d.notes ?? "",
      });
      setDirty(false);
    }
  }, [prod.data]);

  const save = useMutation({
    mutationFn: async () => {
      // El vendedor puro sólo puede modificar las notas internas.
      const payload: Record<string, any> = isSellerOnly
        ? { notes: form.notes || null }
        : {
            status: form.status,
            assigned_to_label: form.assigned_to_label || null,
            due_date: form.due_date || null,
            notes: form.notes || null,
          };
      const { error } = await supabase.from("production_orders").update(payload as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orden de producción actualizada");
      qc.invalidateQueries({ queryKey: ["production-order", id] });
      qc.invalidateQueries({ queryKey: ["production-audit", id] });
      qc.invalidateQueries({ queryKey: ["production-orders-drive"] });
      setDirty(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const [delOpen, setDelOpen] = useState(false);
  const [rejOpen, setRejOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const remove = useMutation({
    mutationFn: async (reason: string) => {
      const { error } = await supabase.rpc("delete_production_with_reason", { p_id: id, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orden de producción eliminada");
      setDelOpen(false);
      navigate({ to: "/erp/production" });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const reject = useMutation({
    mutationFn: async (reason: string) => {
      const { error } = await supabase.rpc("reject_production_with_reason", { p_id: id, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orden marcada como rechazada");
      setRejOpen(false);
      qc.invalidateQueries({ queryKey: ["production-order", id] });
      qc.invalidateQueries({ queryKey: ["production-audit", id] });
      qc.invalidateQueries({ queryKey: ["production-orders"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const accept = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("production_orders")
        .update({ status: "en_proceso", novedad: "produccion" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orden aceptada — pasa a seguimiento");
      qc.invalidateQueries({ queryKey: ["production-order", id] });
      qc.invalidateQueries({ queryKey: ["production-audit", id] });
      qc.invalidateQueries({ queryKey: ["production-orders-pending"], refetchType: "all" });
      qc.invalidateQueries({ queryKey: ["production-orders-drive"], refetchType: "all" });
      qc.invalidateQueries({ queryKey: ["production-hub-counts"], refetchType: "all" });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const cancelOrder = useMutation({
    mutationFn: async (reason: string) => {
      const { error } = await supabase.rpc("cancel_production_with_reason", { p_id: id, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orden cancelada — los productos quedan liberados para reenviarse");
      setCancelOpen(false);
      qc.invalidateQueries({ queryKey: ["production-order", id] });
      qc.invalidateQueries({ queryKey: ["production-audit", id] });
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      qc.invalidateQueries({ queryKey: ["production-by-order"] });
      qc.invalidateQueries({ queryKey: ["order-items-for-production"] });
      if (prod.data?.order_id) navigate({ to: "/erp/orders/$id", params: { id: prod.data.order_id } });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const regen = useMutation({
    mutationFn: async () => {
      if (!prod.data?.order_id) throw new Error("Esta orden no está vinculada a una venta");
      const { data: linked, error: liErr } = await supabase
        .from("order_items").select("id").eq("production_order_id", id);
      if (liErr) throw liErr;
      let itemIds = (linked ?? []).map((r: any) => r.id);
      if (itemIds.length === 0) {
        const { data: all, error: aErr } = await supabase
          .from("order_items").select("id").eq("order_id", prod.data.order_id);
        if (aErr) throw aErr;
        itemIds = (all ?? []).map((r: any) => r.id);
      }
      if (itemIds.length === 0) throw new Error("No hay productos para incluir");
      return generatePlanimetryForOrder({
        productionOrderId: id,
        productionCode: prod.data.code,
        orderId: prod.data.order_id,
        brandId: prod.data.brand_id,
        selectedItemIds: itemIds,
        noteOverride: "Planimetría regenerada con el formato actualizado",
      });
    },
    onSuccess: (v) => {
      toast.success(`Planimetría v${v} regenerada`);
      qc.invalidateQueries({ queryKey: ["planimetries", id] });
      qc.invalidateQueries({ queryKey: ["production-audit", id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  if (prod.isLoading) {
    return <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" /></div>;
  }
  if (!prod.data) {
    return <p className="text-sm text-muted-foreground">No encontrada.</p>;
  }
  const p = prod.data;
  const order = p.order as any;
  const sellerLocked = isSellerOnly && isProductionLocked(p.status);
  const isPending = p.status === "pendiente";
  const sellerCanEditPlanimetry = isSellerOnly && isPending;
  const sellerCanManageOrder = isSellerOnly && isPending;

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link to="/erp/production" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
            <ArrowLeft className="h-3 w-3" /> Volver a Producción
          </Link>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-3 flex-wrap">
            <span className="font-mono">{p.code}</span>
            <ProductionStatusBadge status={p.status} />
          </h1>
          {order && (
            <Link to="/erp/orders/$id" params={{ id: order.id }}
              className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mt-1">
              Venta {order.order_number} · {order.customer_name} <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {!isSellerOnly && p.status === "pendiente" && (
            <Button variant="outline" size="sm" onClick={() => setRejOpen(true)} className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10">
              <ShieldAlert className="h-4 w-4" /> Rechazar
            </Button>
          )}
          {!isSellerOnly && p.status === "pendiente" && (
            <Button size="sm" onClick={() => accept.mutate()} disabled={accept.isPending} className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
              {accept.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Aceptar orden
            </Button>
          )}
          {!isSellerOnly && p.status !== "pendiente" && p.status !== "rechazada" && (
            <Button variant="outline" size="sm" onClick={() => setRejOpen(true)} className="gap-1 text-amber-700 dark:text-amber-300">
              <ShieldAlert className="h-4 w-4" /> Rechazar
            </Button>
          )}
          {p.status === "pendiente" && (
            <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)} className="gap-1 border-rose-500/40 text-rose-700 dark:text-rose-300 hover:bg-rose-500/10">
              <XCircle className="h-4 w-4" /> Cancelar orden
            </Button>
          )}
          {(isAdmin || sellerCanManageOrder) && (
            <Button variant="outline" size="sm" onClick={() => setDelOpen(true)} className="text-destructive gap-1">
              <Trash2 className="h-4 w-4" /> Eliminar
            </Button>
          )}
          <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending} className="gap-1">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar cambios
          </Button>
        </div>

      </div>

      <ReasonDialog
        open={delOpen} onOpenChange={setDelOpen}
        title="Eliminar orden de producción"
        description="Esta acción es definitiva. Quedará registrada en el historial de eliminaciones con tu usuario y el motivo."
        confirmLabel="Eliminar definitivamente"
        confirmVariant="destructive"
        pending={remove.isPending}
        onConfirm={(r) => remove.mutate(r)}
      />
      <ReasonDialog
        open={rejOpen} onOpenChange={setRejOpen}
        title="Rechazar y devolver al vendedor"
        description="La orden se marcará como rechazada y el motivo quedará en la bitácora. El vendedor puede corregir y reenviar sin perder el historial."
        confirmLabel="Rechazar"
        pending={reject.isPending}
        onConfirm={(r) => reject.mutate(r)}
      />
      <ReasonDialog
        open={cancelOpen} onOpenChange={setCancelOpen}
        title="Cancelar orden de producción"
        description="Sólo puedes cancelar mientras la orden esté en estado Pendiente. Al cancelar, los productos quedan liberados para volver a enviarse desde la venta. Si producción ya aceptó la orden, comunícate con ellos por WhatsApp."
        confirmLabel="Cancelar orden"
        confirmVariant="destructive"
        pending={cancelOrder.isPending}
        onConfirm={(r) => cancelOrder.mutate(r)}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-xl border border-border bg-surface p-5 space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground">Detalles</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Estado</Label>
                {isSellerOnly ? (
                  <Input value={PRODUCTION_STATUSES.find((s) => s.value === form.status)?.label ?? form.status} disabled />
                ) : (
                  <Select value={form.status} onValueChange={(v) => update("status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRODUCTION_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <Label className="text-xs">Encargado</Label>
                <Input
                  value={form.assigned_to_label || (isSellerOnly ? "—" : "")}
                  onChange={(e) => update("assigned_to_label", e.target.value)}
                  placeholder="Nombre del responsable"
                  disabled={isSellerOnly}
                />
              </div>
              <div>
                <Label className="text-xs">Entrega estimada</Label>
                {isSellerOnly ? (
                  <Input
                    value={form.due_date ? new Date(form.due_date + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                    disabled
                  />
                ) : (
                  <Input
                    type="date"
                    value={form.due_date ?? ""}
                    onChange={(e) => update("due_date", e.target.value)}
                  />
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs">Notas internas</Label>
              <Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={3} placeholder="Especificaciones, materiales, observaciones…" />
            </div>
            {isSellerOnly && p.status !== "pendiente" && p.status !== "cancelado" && p.status !== "rechazada" && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-900 dark:text-amber-200">
                Esta orden ya fue aceptada por producción. Para cualquier modificación o cancelación, comunícate directamente con producción por WhatsApp.
              </div>
            )}
          </section>

          {!isSellerOnly && p.order_id && (
            <ItemMarginsSection
              productionOrderId={p.id}
              orderId={p.order_id}
              brandId={p.brand_id}
            />
          )}


          <section className="rounded-xl border border-border bg-surface p-5 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-sm font-medium text-muted-foreground">Planimetrías</h2>
              {!sellerLocked && !isSellerOnly && (
                <Button size="sm" variant="outline" onClick={() => regen.mutate()}
                  disabled={regen.isPending || !p.order_id} className="gap-1">
                  {regen.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Regenerar con formato actualizado
                </Button>
              )}
            </div>
            {plan.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <PlanimetryUploader
                productionOrderId={p.id}
                brandId={p.brand_id}
                items={plan.data ?? []}
                canDelete={isAdmin || sellerCanEditPlanimetry}
                readOnly={isSellerOnly ? !sellerCanEditPlanimetry : sellerLocked}
                onChange={() => {
                  qc.invalidateQueries({ queryKey: ["planimetries", id] });
                  qc.invalidateQueries({ queryKey: ["production-audit", id] });
                }}
              />
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-3">
              <History className="h-4 w-4" /> Bitácora
            </h2>
            {(() => {
              const rows = (audit.data ?? []) as any[];
              const created = [...rows].reverse().find((r) => r.action === "create");
              const rejected = rows.find((r) => r.action === "rejected");
              if (!created && !rejected) return null;
              const fmt = (iso: string) => new Date(iso).toLocaleString("es-CO", {
                day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
              });
              return (
                <div className="mb-4 space-y-2">
                  {created && (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-primary font-semibold">Enviada por</p>
                      <p className="text-sm font-medium truncate">{created.changed_by_email ?? "—"}</p>
                      <p className="text-[11px] text-muted-foreground">{fmt(created.created_at)}</p>
                    </div>
                  )}
                  {rejected && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-destructive font-semibold">Rechazada por</p>
                      <p className="text-sm font-medium truncate">{rejected.changed_by_email ?? "—"}</p>
                      <p className="text-[11px] text-muted-foreground">{fmt(rejected.created_at)}</p>
                      {rejected.note && (
                        <p className="text-xs italic mt-1 text-foreground/80">"{rejected.note}"</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
            {audit.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <AuditTimeline rows={(audit.data ?? []) as any} />
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
