import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Trash2, History, Pencil, X, ShieldCheck, MessageSquare, Calendar, AlertTriangle, FileText, CheckCircle2, Building2 } from "lucide-react";
import { ChangeBrandDialog } from "@/features/orders/change-brand-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { StatusBadge } from "@/features/orders/status-badge";
import { OrderItemsEditor, formatMoney } from "@/features/orders/order-items-editor";
import { AmountOrPercentInput } from "@/features/orders/amount-percent-input";
import type { OrderItemInput } from "@/features/orders/schemas";
import type { PendingImage } from "@/features/orders/image-uploader";
import type { PendingPlanimetry } from "@/features/orders/planimetry-files-uploader";
import { uploadOrderImages } from "@/lib/image-upload";
import { uploadPlanimetryFiles, type PlanimetryFile } from "@/lib/planimetry-upload";
import { AuditTimeline, type AuditRow } from "@/features/orders/audit-timeline";
import { InvoicePanel } from "@/features/invoices/invoice-panel";
import { EditInvoiceNumberButton } from "@/features/invoices/edit-invoice-number-dialog";
import { EditAlegraInvoiceButton } from "@/features/invoices/edit-alegra-number-dialog";
import { PaymentBadge } from "@/features/invoices/invoice-badges";
import { PaymentsPanel } from "@/features/finance/payments-panel";
import { PartialShipmentToggle } from "@/features/orders/partial-shipment-toggle";
import { formatDepositAccount } from "@/features/finance/deposit-accounts";
import { DeleteOrderDialog } from "@/features/orders/delete-order-dialog";
import { ProductionSection } from "@/features/production/send-to-production-button";
import { OrderSellerTasksBadge } from "@/features/seller-tasks/seller-tasks-panel";
import { ScheduleLogisticsCard } from "@/features/orders/schedule-logistics-card";
import { getDeliveryUrgency, urgencyChipClasses, formatDeliveryDate } from "@/features/orders/delivery-urgency";
import { DeliveryDeferralCard } from "@/features/orders/delivery-deferral-card";
import { SaleFlowCard } from "@/features/orders/sale-flow-card";
import { isProductionLocked, useSellerRestricted } from "@/features/production/seller-restrictions";
import { useRealtimeSync } from "@/lib/use-realtime-sync";
import { useSession } from "@/lib/use-session";

export const Route = createFileRoute("/_authenticated/erp/orders/$id")({
  component: OrderDetail,
});

function OrderDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { selectedBrandId, isAdmin } = useBrand();
  const { isSellerRestricted } = useSellerRestricted();
  const session = useSession();
  const currentUserId = session.session?.user.id ?? null;

  // Realtime: reflect approval, payments, invoices and seller tasks on this order without reloading
  useRealtimeSync("orders", { column: "id", value: id }, [["order", id], ["order-history", id], ["order-audit", id]]);
  useRealtimeSync("order_approval_log", { column: "order_id", value: id }, [["order", id], ["order-audit", id]]);
  useRealtimeSync("order_payments", { column: "order_id", value: id }, [["order-payments-sum", id], ["order", id]]);
  useRealtimeSync("invoices", { column: "order_id", value: id }, [["order", id]]);
  useRealtimeSync("seller_tasks", { column: "order_id", value: id }, [["seller-tasks", "by-order", id], ["my-tasks"], ["my-tasks-count"]]);

  const orderQuery = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id, order_number, invoice_number, alegra_invoice_number, sale_date, status_id, notes, subtotal, discount, tax, total, created_at, brand_id, estimated_delivery_date, scheduled_delivery_date, is_deferred_delivery, deferred_reason, deferred_at,
          sale_type, separe_activated_at, separe_completed_at, price_locked_at, seller_id,
          paulatino_authorized_by_email, paulatino_authorized_at, paulatino_advance_at_send,
          approval_status, approval_requested_at, approval_resolved_at, approval_note,
          payment_method, advance_amount, advance_deposit_account, payment_proof_url,
          customer_name, customer_doc_type, customer_doc_number, customer_phone, customer_email,
          customer_address, customer_city, customer_department, customer_company, customer_person_type, customer_contact_type,
          status:order_statuses(id, name, color, slug, is_draft),
          items:order_items(id, description, quantity, unit_price, line_total, sort_order, images, planimetry_files, production_order_id, partial_shipment_enabled, partial_delivered_at, production_finished_at, is_standard_product, is_gift, gifted_by_email, gifted_at, production_order:production_orders!production_order_id(status))
        `)
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const statusesQuery = useQuery({
    queryKey: ["statuses", selectedBrandId],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_statuses")
        .select("id, name, color, sort_order, slug, is_draft")
        .eq("brand_id", selectedBrandId!)
        .eq("is_active", true)
        .eq("is_draft", false)
        .neq("slug", "borrador")
        .neq("name", "Borrador")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const historyQuery = useQuery({
    queryKey: ["order-history", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_status_history")
        .select("id, created_at, note, changed_by, from:order_statuses!from_status_id(name,color), to:order_statuses!to_status_id(name,color)")
        .eq("order_id", id).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const auditQuery = useQuery({
    queryKey: ["order-audit", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("order_audit_log")
        .select("id, created_at, changed_by, changed_by_email, action, entity, field, old_value, new_value")
        .eq("order_id", id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  // Suma de pagos registrados: alimenta el % de Plan Separe y el gate para producción.
  const paymentsSumQuery = useQuery({
    queryKey: ["order-payments-sum", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_payments")
        .select("amount")
        .eq("order_id", id);
      if (error) throw error;
      return (data ?? []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    },
  });

  const [newStatus, setNewStatus] = useState("");
  const [statusNote, setStatusNote] = useState("");

  // edit mode state
  const [editing, setEditing] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [editDiscount, setEditDiscount] = useState(0);
  const [editTax, setEditTax] = useState(0);
  const [editETA, setEditETA] = useState<string>("");
  const [editItems, setEditItems] = useState<(OrderItemInput & { id?: string })[]>([]);
  const [editExistingImages, setEditExistingImages] = useState<string[][]>([]);
  const [editPendingImages, setEditPendingImages] = useState<PendingImage[][]>([]);
  const [editExistingPlanimetry, setEditExistingPlanimetry] = useState<PlanimetryFile[][]>([]);
  const [editPendingPlanimetry, setEditPendingPlanimetry] = useState<PendingPlanimetry[][]>([]);

  // Hydration: only sync from server when NOT editing or when the order id changes.
  // This prevents losing in-progress edits when other queries (status, history, audit)
  // are invalidated and re-fetch the order.
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!orderQuery.data) return;
    if (editing && hydratedFor.current === id) return;
    const o = orderQuery.data as any;
    setEditNotes(o.notes ?? "");
    setEditDiscount(Number(o.discount ?? 0));
    setEditTax(Number(o.tax ?? 0));
    setEditETA(o.estimated_delivery_date ?? "");
    const its = ((o.items ?? []) as any[]).slice().sort((a, b) => a.sort_order - b.sort_order);
    setEditItems(its.map((it) => ({
      id: it.id, description: it.description, quantity: Number(it.quantity),
      unit_price: Number(it.unit_price), sort_order: it.sort_order,
      is_standard_product: Boolean(it.is_standard_product),
    })));

    setEditExistingImages(its.map((it) => (Array.isArray(it.images) ? [...it.images] : [])));
    setEditPendingImages(its.map(() => []));
    setEditExistingPlanimetry(
      its.map((it) => (Array.isArray(it.planimetry_files) ? [...it.planimetry_files] : [])),
    );
    setEditPendingPlanimetry(its.map(() => []));
    hydratedFor.current = id;
  }, [orderQuery.data, editing, id]);

  const changeStatus = useMutation({
    mutationFn: async () => {
      if (!newStatus) throw new Error("Selecciona un estado");
      const note = statusNote.trim();
      const { error } = await supabase.rpc("update_order_status", {
        p_order_id: id,
        p_status_id: newStatus,
        p_note: note || undefined,
      });
      if (error) throw error;
      return { hadNote: !!note };
    },
    onSuccess: (res) => {
      toast.success(
        res?.hadNote
          ? "Estado actualizado · nota guardada en el historial"
          : "Estado actualizado",
      );
      setStatusNote(""); setNewStatus("");
      qc.invalidateQueries({ queryKey: ["order", id] });
      qc.invalidateQueries({ queryKey: ["order-history", id] });
      qc.invalidateQueries({ queryKey: ["order-audit", id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveEdit = useMutation({
    mutationFn: async () => {
      const original = orderQuery.data as any;
      // Update order header fields (only if changed — triggers will dedupe via IS DISTINCT FROM)
      const { error: upErr } = await supabase.from("orders").update({
        notes: editNotes || null,
        discount: editDiscount,
        tax: editTax,
        estimated_delivery_date: editETA || null,
      }).eq("id", id);
      if (upErr) throw upErr;

      // Diff items
      const originalItems = ((original.items ?? []) as any[]);
      const origMap = new Map(originalItems.map((it) => [it.id, it]));
      const keptIds = new Set<string>();

      for (let i = 0; i < editItems.length; i++) {
        const it = editItems[i];
        const existing = editExistingImages[i] ?? [];
        const pending = editPendingImages[i] ?? [];
        const orig = it.id ? origMap.get(it.id) : null;
        const origImages: string[] = Array.isArray(orig?.images) ? orig!.images : [];
        const imagesChanged =
          !it.id ||
          pending.length > 0 ||
          existing.length !== origImages.length ||
          existing.some((u, k) => u !== origImages[k]);

        let itemId = it.id ?? null;
        if (it.id) {
          keptIds.add(it.id);
          const changed = !orig
            || orig.description !== it.description
            || Number(orig.quantity) !== Number(it.quantity)
            || Number(orig.unit_price) !== Number(it.unit_price)
            || Number(orig.sort_order) !== i
            || Boolean(orig.is_standard_product) !== Boolean(it.is_standard_product);
          if (changed) {
            const { error } = await supabase.from("order_items").update({
              description: it.description,
              quantity: it.quantity,
              unit_price: it.unit_price,
              sort_order: i,
              is_standard_product: Boolean(it.is_standard_product),
            }).eq("id", it.id);
            if (error) throw error;
          }
        } else {
          const { data: inserted, error } = await supabase.from("order_items").insert({
            order_id: id,
            description: it.description,
            quantity: it.quantity,
            unit_price: it.unit_price,
            sort_order: i,
            is_standard_product: Boolean(it.is_standard_product),
          }).select("id").single();
          if (error) throw error;
          itemId = inserted.id;
        }


        if (itemId && imagesChanged) {
          let uploadedUrls: string[] = [];
          if (pending.length > 0) {
            uploadedUrls = await uploadOrderImages(
              pending.map((p) => p.file),
              `items/${itemId}`,
            );
          }
          const finalUrls = [...existing, ...uploadedUrls];
          const { error: imgErr } = await supabase
            .from("order_items")
            .update({ images: finalUrls as never })
            .eq("id", itemId);
          if (imgErr) throw imgErr;
        }

        // Planimetry files (image or PDF)
        if (itemId) {
          const existingPlani = editExistingPlanimetry[i] ?? [];
          const pendingPlani = editPendingPlanimetry[i] ?? [];
          const origPlani: PlanimetryFile[] = Array.isArray(orig?.planimetry_files)
            ? (orig!.planimetry_files as PlanimetryFile[])
            : [];
          const planiChanged =
            pendingPlani.length > 0 ||
            existingPlani.length !== origPlani.length ||
            existingPlani.some((f, k) => f.url !== origPlani[k]?.url);
          if (planiChanged) {
            let uploaded: PlanimetryFile[] = [];
            if (pendingPlani.length > 0) {
              uploaded = await uploadPlanimetryFiles(
                pendingPlani.map((p) => p.file),
                `items/${itemId}/planimetry`,
              );
            }
            const finalPlani = [...existingPlani, ...uploaded];
            const { error: planiErr } = await supabase
              .from("order_items")
              .update({ planimetry_files: finalPlani as never })
              .eq("id", itemId);
            if (planiErr) throw planiErr;
          }
        }
      }
      // Delete removed
      const toDelete = originalItems.filter((it) => !keptIds.has(it.id)).map((it) => it.id);
      if (toDelete.length) {
        const { error } = await supabase.from("order_items").delete().in("id", toDelete);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Pedido actualizado");
      setEditing(false);
      hydratedFor.current = null;
      qc.invalidateQueries({ queryKey: ["order", id] });
      qc.invalidateQueries({ queryKey: ["order-audit", id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order-items-for-production", id] });
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      qc.invalidateQueries({ queryKey: ["my-tasks-count"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [changeBrandOpen, setChangeBrandOpen] = useState(false);

  if (orderQuery.isLoading) return <div className="grid place-items-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  const o = orderQuery.data as any;
  if (!o) return <p className="text-sm text-muted-foreground">Pedido no encontrado.</p>;

  const items = ((o.items as any[] | null) ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const status = o.status as any;
  const shouldShowStatus = status && !status.is_draft && status.slug !== "borrador" && status.name !== "Borrador";
  // Aprobación gerencial pendiente/rechazada: el vendedor queda en stand-by
  // total — no puede editar productos, subir planimetría ni enviar a producción.
  const approvalBlocksSeller =
    isSellerRestricted &&
    (o.approval_status === "pendiente" || o.approval_status === "rechazada");
  const planimetryLockedByIndex = items.map((it) =>
    approvalBlocksSeller || (isSellerRestricted && isProductionLocked(it.production_order?.status)),
  );



  return (
    <>
      <Link to="/erp/orders" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-3 w-3" /> Ventas
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-6 gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-1 truncate flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{o.order_number}{o.invoice_number ? ` · Fact. ${o.invoice_number}` : ""}</span>
            <EditInvoiceNumberButton orderId={o.id} currentInvoiceNumber={o.invoice_number} />
          </p>
          <p className="text-[11px] text-muted-foreground mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="normal-case tracking-normal">
              Alegra:{" "}
              {o.alegra_invoice_number ? (
                <span className="font-mono text-foreground">Fact. {o.alegra_invoice_number}</span>
              ) : (
                <span className="italic">sin vincular</span>
              )}
            </span>
            <EditAlegraInvoiceButton orderId={o.id} currentAlegraNumber={o.alegra_invoice_number} />
          </p>
          <h1 className="font-display text-2xl font-semibold break-words">{o.customer_name ?? "Sin cliente"}</h1>
          {(() => {
            const { urgency, label: urgencyLabel } = getDeliveryUrgency(o.estimated_delivery_date);
            return (
              <div className={`mt-2 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-base font-semibold ${urgencyChipClasses(urgency)}`}>
                <Calendar className="h-4 w-4" />
                <span>
                  {o.estimated_delivery_date
                    ? formatDeliveryDate(o.estimated_delivery_date, { long: true })
                    : "Sin fecha de entrega"}
                </span>
                {urgency !== "none" && urgency !== "normal" && (
                  <span className="text-xs font-medium opacity-90">· {urgencyLabel}</span>
                )}
              </div>
            );
          })()}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {(o as any).approval_status === "pendiente" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/60 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Pendiente de aprobación por gerencia
            </span>
          )}
          {(o as any).approval_status === "rechazada" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/60 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:text-rose-300">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              Aprobación rechazada
            </span>
          )}
          {shouldShowStatus && <StatusBadge name={status.name} color={status.color} />}
          {!editing ? (
            <>
              {!approvalBlocksSeller && (
                <>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditing(true)}>
                    <Pencil className="h-4 w-4" /> Editar
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => setChangeBrandOpen(true)}>
                    <Building2 className="h-4 w-4" /> Cambiar marca
                  </Button>
                  <Button variant="outline" size="icon" className="text-destructive border-destructive/40 hover:bg-destructive/10"
                    onClick={() => setDeleteOpen(true)}
                    aria-label="Eliminar venta">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </>

          ) : (
            <div className="flex w-full sm:w-auto gap-2">
              <Button variant="ghost" size="sm" className="gap-2 flex-1 sm:flex-none" onClick={() => {
                if (confirm("¿Descartar los cambios sin guardar?")) {
                  hydratedFor.current = null;
                  setEditing(false);
                }
              }}>
                <X className="h-4 w-4" /> Cancelar
              </Button>
              <Button size="sm" className="flex-1 sm:flex-none" onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>
                {saveEdit.isPending ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {approvalBlocksSeller && (
        <div className="mb-5 rounded-xl border-2 border-amber-500/60 bg-amber-500/10 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              {o.approval_status === "pendiente"
                ? "Venta en espera de aprobación gerencial"
                : "Aprobación gerencial rechazada"}
            </p>
            <p className="text-xs text-amber-800/90 dark:text-amber-200/80 mt-0.5">
              {o.approval_status === "pendiente"
                ? "Esta venta quedó pendiente de aprobación porque el anticipo es menor al 50%. Hasta que gerencia apruebe, no puedes editarla, subir planimetría ni enviarla a producción."
                : "Gerencia rechazó la solicitud de excepción de anticipo. Contacta a gerencia antes de continuar con esta venta."}
            </p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">

          <DeliveryDeferralCard
            orderId={o.id}
            estimatedDate={o.estimated_delivery_date}
            scheduledDate={(o as any).scheduled_delivery_date ?? null}
            isDeferred={Boolean((o as any).is_deferred_delivery)}
            deferredReason={(o as any).deferred_reason ?? null}
            canEdit
            onDone={() => orderQuery.refetch()}
          />
          {(() => {
            const missing = items.filter(
              (it: any) =>
                !it.production_order_id &&
                !it.is_standard_product &&
                (!Array.isArray(it.planimetry_files) || it.planimetry_files.length === 0),
            ).length;
            if (missing === 0 || editing) return null;
            return (
              <div className="rounded-xl border-2 border-amber-500/60 bg-amber-500/10 p-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    Faltan {missing} planimetría{missing === 1 ? "" : "s"} para enviar todo a producción
                  </p>
                  <p className="text-xs text-amber-800/90 dark:text-amber-200/80 mt-0.5">
                    Edita la venta y sube la planimetría (imagen o PDF) de cada producto de medida.
                    Los productos marcados como <strong>estándar</strong> no requieren planimetría y no se incluyen en este conteo.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="shrink-0 border-amber-600/60">
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                </Button>
              </div>
            );
          })()}

          <div className="rounded-xl border border-border bg-surface p-5">
            <p className="text-sm font-medium mb-3">Productos</p>
            {editing ? (
              <OrderItemsEditor
                items={editItems}
                onChange={setEditItems}
                existingImages={editExistingImages}
                pendingImages={editPendingImages}
                onExistingImagesChange={setEditExistingImages}
                onPendingImagesChange={setEditPendingImages}
                existingPlanimetry={editExistingPlanimetry}
                pendingPlanimetry={editPendingPlanimetry}
                onExistingPlanimetryChange={setEditExistingPlanimetry}
                onPendingPlanimetryChange={setEditPendingPlanimetry}
                planimetryReadOnlyByIndex={planimetryLockedByIndex}
              />
            ) : (
              <div className="space-y-3">
                {items.map((it: any, idx: number) => {
                  const imgs: string[] = Array.isArray(it.images) ? it.images : [];
                  const planiFiles: PlanimetryFile[] = Array.isArray(it.planimetry_files) ? it.planimetry_files : [];
                  return (
                    <OrderItemReadCard
                      key={it.id}
                      itemId={it.id}
                      orderId={o.id}
                      index={idx}
                      description={it.description ?? ""}
                      quantity={Number(it.quantity)}
                      unitPrice={Number(it.unit_price)}
                      lineTotal={Number(it.line_total)}
                      images={imgs}
                      planimetryFiles={planiFiles}
                      sentToProduction={!!it.production_order_id}
                      partialEnabled={!!it.partial_shipment_enabled}
                      partialDeliveredAt={it.partial_delivered_at}
                      productionFinishedAt={it.production_finished_at}
                      isStandardProduct={!!it.is_standard_product}
                      isGift={!!(it as any).is_gift}
                      giftedByEmail={(it as any).gifted_by_email ?? null}
                      giftedAt={(it as any).gifted_at ?? null}
                      canManageGift={isAdmin || (!!currentUserId && (o as any).seller_id === currentUserId)}
                    />
                  );
                })}

                <div className="rounded-lg border border-border p-3 space-y-1.5 text-sm bg-background/40">
                  <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="tabular-nums">{formatMoney(o.subtotal)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Descuento</span><span className="tabular-nums">- {formatMoney(o.discount)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Impuesto</span><span className="tabular-nums">+ {formatMoney(o.tax)}</span></div>
                  <div className="flex justify-between pt-1.5 border-t border-border font-semibold"><span>Total</span><span className="tabular-nums">{formatMoney(o.total)}</span></div>
                </div>
              </div>
            )}


            {editing && (() => {
              const liveSubtotal = editItems.reduce(
                (s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0),
                0,
              );
              const liveTotal = Math.max(0, liveSubtotal - editDiscount + editTax);
              return (
                <>
                  <div className="grid sm:grid-cols-3 gap-3 mt-4">
                    <div>
                      <Label className="text-xs mb-1.5 block text-muted-foreground">Descuento (%)</Label>
                      <AmountOrPercentInput
                        value={editDiscount}
                        onValueChange={setEditDiscount}
                        subtotal={liveSubtotal}
                        label="Se descontará"
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block text-muted-foreground">Impuesto (%)</Label>
                      <AmountOrPercentInput
                        value={editTax}
                        onValueChange={setEditTax}
                        subtotal={liveSubtotal}
                        label="Se cobrará"
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block text-muted-foreground">Entrega estimada</Label>
                      <Input type="date" value={editETA ?? ""} onChange={(e) => setEditETA(e.target.value)} />
                    </div>
                  </div>
                  <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 space-y-1.5 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal productos</span>
                      <span className="tabular-nums">{formatMoney(liveSubtotal)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Descuento</span>
                      <span className="tabular-nums">- {formatMoney(editDiscount)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Impuesto</span>
                      <span className="tabular-nums">+ {formatMoney(editTax)}</span>
                    </div>
                    <div className="flex justify-between pt-2 mt-1 border-t border-border font-semibold text-base">
                      <span>Total a cobrar</span>
                      <span className="tabular-nums text-primary">{formatMoney(liveTotal)}</span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <p className="text-sm font-medium mb-2">Notas</p>
            {editing ? (
              <Textarea rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Notas del pedido…" />
            ) : (
              o.notes
                ? <p className="text-sm text-muted-foreground whitespace-pre-wrap">{o.notes}</p>
                : <p className="text-xs text-muted-foreground italic">Sin notas.</p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center gap-2 mb-3">
              <History className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Historial de estados</p>
            </div>
            {historyQuery.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (historyQuery.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin movimientos.</p>
            ) : (
              <ol className="space-y-4">
                {historyQuery.data!.map((h: any) => {
                  const showFrom = h.from && h.from.name !== "Borrador";
                  const showTo = h.to && h.to.name !== "Borrador";
                  return (
                    <li key={h.id} className="text-sm">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {showFrom && <StatusBadge name={h.from.name} color={h.from.color} />}
                        {showFrom && showTo && <span className="text-muted-foreground">→</span>}
                        {showTo && <StatusBadge name={h.to.name} color={h.to.color} />}
                        <span className="text-xs text-muted-foreground ml-1">
                          {new Date(h.created_at).toLocaleString("es-CO")}
                        </span>
                      </div>
                      {h.note && (
                        <div className="flex gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm text-foreground/90">
                          <MessageSquare className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                          <span className="whitespace-pre-wrap">{h.note}</span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Auditoría de cambios</p>
            </div>
            {auditQuery.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <AuditTimeline entries={(auditQuery.data ?? []) as AuditRow[]} />
            )}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-xl border border-border bg-surface p-5 space-y-1.5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Cliente</p>
              <EditCustomerButton order={o} onSaved={() => qc.invalidateQueries({ queryKey: ["order", id] })} />
            </div>
            <p className="text-sm font-semibold">{o.customer_name ?? "—"}</p>
            {o.customer_company && <p className="text-xs text-muted-foreground">{o.customer_company}</p>}
            {o.customer_doc_number && (
              <p className="text-xs text-muted-foreground">
                {(o.customer_doc_type ? `${o.customer_doc_type} ` : "")}{o.customer_doc_number}
              </p>
            )}
            {o.customer_phone && <p className="text-xs text-muted-foreground">{o.customer_phone}</p>}
            {o.customer_email ? (
              <p className="text-xs text-muted-foreground">{o.customer_email}</p>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Sin correo — requerido para enviar la cuenta de cobro
              </p>
            )}
            {(o.customer_address || o.customer_city || o.customer_department) && (
              <p className="text-xs text-muted-foreground">
                {[o.customer_address, o.customer_city, o.customer_department].filter(Boolean).join(", ")}
              </p>
            )}
            {(o.payment_method || o.advance_amount > 0) && (
              <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground space-y-0.5">
                {o.payment_method && <p>Pago: <span className="text-foreground">{o.payment_method}</span></p>}
                {o.advance_amount > 0 && <p>Abono: <span className="text-foreground tabular-nums">{formatMoney(o.advance_amount)}</span></p>}
                {o.advance_deposit_account && (
                  <p>Cuenta destino: <span className="text-foreground">{formatDepositAccount(o.advance_deposit_account)}</span></p>
                )}
              </div>
            )}
            {o.payment_proof_url && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Comprobante de pago
                </p>
                <a
                  href={o.payment_proof_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg overflow-hidden border border-border bg-muted aspect-video hover:border-accent/60 transition-colors"
                >
                  <img src={o.payment_proof_url} alt="Comprobante de pago" className="w-full h-full object-cover" />
                </a>
              </div>
            )}
          </div>

          <InvoicePanel order={o as any} />

          <PaymentsPanel
            orderId={o.id}
            brandId={o.brand_id}
            total={Number(o.total) || 0}
            advance={Number(o.advance_amount) || 0}
          />

          <OrderSellerTasksBadge orderId={o.id} />

          <SaleFlowCard
            order={{
              id: o.id,
              total: o.total,
              advance_amount: o.advance_amount,
              sale_type: (o as any).sale_type ?? null,
              separe_activated_at: (o as any).separe_activated_at ?? null,
              separe_completed_at: (o as any).separe_completed_at ?? null,
              approval_status: (o as any).approval_status ?? null,
              approval_requested_at: (o as any).approval_requested_at ?? null,
              approval_resolved_at: (o as any).approval_resolved_at ?? null,
              approval_note: (o as any).approval_note ?? null,
              paulatino_authorized_by_email: (o as any).paulatino_authorized_by_email ?? null,
              paulatino_authorized_at: (o as any).paulatino_authorized_at ?? null,
              paulatino_advance_at_send: (o as any).paulatino_advance_at_send ?? null,
            }}
            paidTotal={(Number(o.advance_amount) || 0) + (paymentsSumQuery.data ?? 0)}
          />

          {(o as any).sale_type !== "entrega_inmediata" && (
            <ProductionSection
              orderId={o.id}
              brandId={o.brand_id}
              saleType={(o as any).sale_type ?? null}
              separeCompletedAt={(o as any).separe_completed_at ?? null}
              approvalStatus={(o as any).approval_status ?? null}
              total={Number(o.total) || 0}
              paidTotal={(Number(o.advance_amount) || 0) + (paymentsSumQuery.data ?? 0)}
            />
          )}


          <ScheduleLogisticsCard orderId={o.id} />







          <div className="rounded-xl border border-border bg-surface p-5">
            <p className="text-sm font-medium mb-3">Cambiar estado</p>
            {editing ? (
              <div className="rounded-lg bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
                Estás editando el pedido. Guarda o cancela los cambios antes de actualizar el estado para no perder lo que estás escribiendo.
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs mb-1.5 block text-muted-foreground">Nuevo estado</Label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>
                      {(statusesQuery.data ?? [])
                        .filter((s) => s.id !== o.status_id)
                        .filter((s) => s.name !== "Borrador")
                        .filter((s) => {
                          const isImmediate = (o as any).sale_type === "entrega_inmediata";
                          const immediateOnly = [
                            "Pendiente de pago (Entrega inmediata)",
                            "Lista para entrega",
                            "En entrega / En ruta",
                            "Entregada (Entrega inmediata)",
                            "Cancelado",
                          ];
                          if (isImmediate) return immediateOnly.includes(s.name);
                          // Para el resto de ventas, ocultar los estados exclusivos de entrega inmediata
                          const immediateExclusive = [
                            "Pendiente de pago (Entrega inmediata)",
                            "Entregada (Entrega inmediata)",
                          ];
                          return !immediateExclusive.includes(s.name);
                        })
                        .map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block text-muted-foreground">
                    Nota (opcional) — quedará en el historial de estados
                  </Label>
                  <Textarea rows={2} value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="Ej. Cliente confirmó por WhatsApp" />
                </div>
                <Button onClick={() => changeStatus.mutate()} disabled={!newStatus || changeStatus.isPending} className="w-full">
                  {changeStatus.isPending ? "Actualizando…" : "Actualizar estado"}
                </Button>
              </div>
            )}
          </div>
        </aside>
      </div>

      <DeleteOrderDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        orderId={id}
        orderNumber={o.order_number}
        customerName={o.customer_name}
        onDeleted={() => navigate({ to: "/erp/orders" })}
      />

      <ChangeBrandDialog
        open={changeBrandOpen}
        onOpenChange={setChangeBrandOpen}
        orderId={id}
        currentBrandId={o.brand_id}
        currentInvoiceNumber={o.invoice_number}
      />
    </>
  );
}


function OrderItemReadCard({
  itemId,
  orderId,
  index,
  description,
  quantity,
  unitPrice,
  lineTotal,
  images,
  planimetryFiles,
  sentToProduction,
  partialEnabled,
  partialDeliveredAt,
  productionFinishedAt,
  isStandardProduct,
  isGift,
  giftedByEmail,
  giftedAt,
  canManageGift,
}: {
  itemId: string;
  orderId: string;
  index: number;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  images: string[];
  planimetryFiles: PlanimetryFile[];
  sentToProduction: boolean;
  partialEnabled: boolean;
  partialDeliveredAt: string | null;
  productionFinishedAt: string | null;
  isStandardProduct: boolean;
  isGift: boolean;
  giftedByEmail: string | null;
  giftedAt: string | null;
  canManageGift: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmGift, setConfirmGift] = useState<null | "mark" | "unmark">(null);
  const isEmpty = !description.trim();
  const lineCount = description.split("\n").filter((l) => l.trim()).length;
  const firstLine = description.split("\n").find((l) => l.trim()) ?? "";
  const hasPlani = planimetryFiles.length > 0;

  const toggleGift = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase
        .from("order_items")
        .update({ is_gift: next } as never)
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isGift ? "Obsequio quitado" : "Ítem marcado como obsequio");
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      setConfirmGift(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-lg border border-border bg-background/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Producto #{index + 1}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {isStandardProduct && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold">
              Estándar
            </span>
          )}
          {sentToProduction && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
              En producción
            </span>
          )}
          {productionFinishedAt && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold">
              Terminado
            </span>
          )}
          {partialDeliveredAt && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold">
              Entregado parcial
            </span>
          )}
          <PartialShipmentToggle itemId={itemId} orderId={orderId} enabled={partialEnabled} />
          {isStandardProduct ? (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold">
              Sin planimetría requerida
            </span>
          ) : hasPlani ? (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold">
              <CheckCircle2 className="h-3 w-3" /> Planimetría OK
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-800 dark:text-amber-200 font-semibold">
              <AlertTriangle className="h-3 w-3" /> Falta planimetría
            </span>
          )}
          {isGift && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-pink-500/15 text-pink-700 dark:text-pink-300 font-semibold">
              🎁 Obsequio
            </span>
          )}
          {canManageGift && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => setConfirmGift(isGift ? "unmark" : "mark")}
              disabled={toggleGift.isPending}
            >
              {isGift ? "Quitar obsequio" : "Marcar como obsequio"}
            </Button>
          )}
        </div>
      </div>

      {isGift && (
        <div className="rounded-md border border-pink-500/30 bg-pink-500/5 px-3 py-1.5 text-[11px] text-pink-900 dark:text-pink-200">
          Este ítem se cobra <strong>$0</strong>. No suma al total ni genera saldo pendiente.
          {giftedByEmail && (
            <span className="block text-[10px] text-muted-foreground mt-0.5">
              Autorizado por {giftedByEmail}
              {giftedAt ? ` · ${new Date(giftedAt).toLocaleString("es-CO")}` : ""}
            </span>
          )}
        </div>
      )}




      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group w-full text-left rounded-md border border-border bg-background/60 hover:border-accent/50 hover:bg-accent/[0.03] transition-colors p-3 space-y-1"
      >
        {isEmpty ? (
          <p className="text-sm text-muted-foreground italic">Sin descripción</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-foreground line-clamp-1">
                {firstLine || "Producto"}
              </p>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5 group-hover:text-accent transition-colors" />
            </div>
            <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-3 leading-snug">
              {description}
            </p>
            <div className="flex items-center gap-2 pt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/80">
              <span>
                {lineCount} línea{lineCount === 1 ? "" : "s"}
              </span>
              <span>·</span>
              <span className="text-accent group-hover:underline">Ver descripción completa</span>
            </div>
          </>
        )}
      </button>

      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground uppercase tracking-wider text-[10px]">Cant.</p>
          <p className="tabular-nums font-medium text-sm mt-0.5">{quantity}</p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground uppercase tracking-wider text-[10px]">Precio</p>
          {isGift ? (
            <p className="tabular-nums font-medium text-sm mt-0.5">
              <span className="line-through text-muted-foreground/70 mr-1">{formatMoney(unitPrice)}</span>
              <span className="text-pink-700 dark:text-pink-300">$0</span>
            </p>
          ) : (
            <p className="tabular-nums font-medium text-sm mt-0.5">{formatMoney(unitPrice)}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-muted-foreground uppercase tracking-wider text-[10px]">Total</p>
          <p className={`tabular-nums font-semibold text-sm mt-0.5 ${isGift ? "text-pink-700 dark:text-pink-300" : ""}`}>
            {formatMoney(isGift ? 0 : lineTotal)}
          </p>
        </div>
      </div>

      {images.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Imágenes de referencia
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {images.map((u) => (
              <a
                key={u}
                href={u}
                target="_blank"
                rel="noreferrer"
                className="aspect-square rounded-md border border-border overflow-hidden bg-muted/40 hover:border-accent/60 transition-colors"
              >
                <img src={u} alt="" className="w-full h-full object-contain" />
              </a>
            ))}
          </div>
        </div>
      )}

      {planimetryFiles.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Planimetría · {planimetryFiles.length} archivo{planimetryFiles.length === 1 ? "" : "s"}
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {planimetryFiles.map((f) => {
              const isImage = /^image\//i.test(f.mime);
              const isPdf = /pdf/i.test(f.mime);
              return (
                <a
                  key={f.url}
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  title={f.name}
                  className="aspect-square rounded-md border border-border overflow-hidden bg-muted/40 hover:border-accent/60 transition-colors flex items-center justify-center"
                >
                  {isImage ? (
                    <img src={f.url} alt={f.name} className="w-full h-full object-contain" />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1 p-2 text-center">
                      <FileText className={`h-7 w-7 ${isPdf ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`} />
                      <span className="text-[9px] text-muted-foreground line-clamp-2 break-all">
                        {f.name}
                      </span>
                    </div>
                  )}
                </a>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Descripción del producto #{index + 1}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border bg-muted/20 p-4 text-sm whitespace-pre-wrap leading-relaxed">
            {description || "Sin descripción"}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmGift} onOpenChange={(v) => !v && setConfirmGift(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmGift === "mark" ? "Marcar como obsequio" : "Quitar obsequio"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmGift === "mark"
              ? "Este ítem se cobrará $0 y no sumará al total de la venta. El precio unitario original se conservará como referencia. ¿Confirmar?"
              : "El ítem volverá a cobrarse a su precio unitario original y sumará al total. ¿Confirmar?"}
          </p>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="ghost" onClick={() => setConfirmGift(null)} disabled={toggleGift.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => toggleGift.mutate(confirmGift === "mark")}
              disabled={toggleGift.isPending}
            >
              {toggleGift.isPending ? "Guardando…" : "Confirmar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditCustomerButton({ order, onSaved }: { order: any; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    customer_name: "",
    customer_company: "",
    customer_doc_type: "",
    customer_doc_number: "",
    customer_phone: "",
    customer_email: "",
    customer_address: "",
    customer_city: "",
    customer_department: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      customer_name: order.customer_name ?? "",
      customer_company: order.customer_company ?? "",
      customer_doc_type: order.customer_doc_type ?? "",
      customer_doc_number: order.customer_doc_number ?? "",
      customer_phone: order.customer_phone ?? "",
      customer_email: order.customer_email ?? "",
      customer_address: order.customer_address ?? "",
      customer_city: order.customer_city ?? "",
      customer_department: order.customer_department ?? "",
    });
  }, [open, order]);

  const save = useMutation({
    mutationFn: async () => {
      const email = form.customer_email.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("Correo electrónico inválido");
      }
      const payload: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(form)) {
        const trimmed = (v ?? "").trim();
        payload[k] = trimmed === "" ? null : trimmed;
      }
      const { error } = await supabase.from("orders").update(payload as never).eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente actualizado");
      setOpen(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const field = (key: keyof typeof form, label: string, type = "text", placeholder?: string) => (
    <div>
      <Label className="text-xs mb-1.5 block text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs" onClick={() => setOpen(true)}>
        <Pencil className="h-3 w-3" /> Editar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            {field("customer_name", "Nombre")}
            {field("customer_company", "Empresa")}
            <div className="grid grid-cols-2 gap-3">
              {field("customer_doc_type", "Tipo doc.", "text", "CC, NIT…")}
              {field("customer_doc_number", "N° documento")}
            </div>
            {field("customer_phone", "Teléfono", "tel")}
            {field("customer_email", "Correo electrónico", "email", "cliente@ejemplo.com")}
            {field("customer_address", "Dirección")}
            <div className="grid grid-cols-2 gap-3">
              {field("customer_city", "Ciudad")}
              {field("customer_department", "Departamento")}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
