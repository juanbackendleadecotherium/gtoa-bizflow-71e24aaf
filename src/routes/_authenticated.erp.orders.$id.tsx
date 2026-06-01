import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Trash2, History, Pencil, X, ShieldCheck, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { StatusBadge } from "@/features/orders/status-badge";
import { OrderItemsEditor, formatMoney } from "@/features/orders/order-items-editor";
import { AmountOrPercentInput } from "@/features/orders/amount-percent-input";
import type { OrderItemInput } from "@/features/orders/schemas";
import { AuditTimeline, type AuditRow } from "@/features/orders/audit-timeline";
import { InvoicePanel } from "@/features/invoices/invoice-panel";
import { PaymentBadge } from "@/features/invoices/invoice-badges";
import { PaymentsPanel } from "@/features/finance/payments-panel";

export const Route = createFileRoute("/_authenticated/erp/orders/$id")({
  component: OrderDetail,
});

function OrderDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { selectedBrandId } = useBrand();

  const orderQuery = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id, order_number, invoice_number, sale_date, status_id, notes, subtotal, discount, tax, total, created_at, brand_id, estimated_delivery_date,
          payment_method, advance_amount, payment_proof_url,
          customer_name, customer_doc_type, customer_doc_number, customer_phone, customer_email,
          customer_address, customer_city, customer_department, customer_company, customer_person_type, customer_contact_type,
          status:order_statuses(id, name, color),
          items:order_items(id, description, quantity, unit_price, line_total, sort_order, images)
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
        .from("order_statuses").select("id, name, color, sort_order")
        .eq("brand_id", selectedBrandId!).eq("is_active", true).order("sort_order");
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

  const [newStatus, setNewStatus] = useState("");
  const [statusNote, setStatusNote] = useState("");

  // edit mode state
  const [editing, setEditing] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [editDiscount, setEditDiscount] = useState(0);
  const [editTax, setEditTax] = useState(0);
  const [editETA, setEditETA] = useState<string>("");
  const [editItems, setEditItems] = useState<(OrderItemInput & { id?: string })[]>([]);

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
    })));
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
        if (it.id) {
          keptIds.add(it.id);
          const orig = origMap.get(it.id);
          const changed = !orig
            || orig.description !== it.description
            || Number(orig.quantity) !== Number(it.quantity)
            || Number(orig.unit_price) !== Number(it.unit_price)
            || Number(orig.sort_order) !== i;
          if (changed) {
            const { error } = await supabase.from("order_items").update({
              description: it.description,
              quantity: it.quantity,
              unit_price: it.unit_price,
              sort_order: i,
            }).eq("id", it.id);
            if (error) throw error;
          }
        } else {
          const { error } = await supabase.from("order_items").insert({
            order_id: id,
            description: it.description,
            quantity: it.quantity,
            unit_price: it.unit_price,
            sort_order: i,
          });
          if (error) throw error;
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
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido eliminado");
      navigate({ to: "/erp/orders" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (orderQuery.isLoading) return <div className="grid place-items-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  const o = orderQuery.data as any;
  if (!o) return <p className="text-sm text-muted-foreground">Pedido no encontrado.</p>;

  const items = ((o.items as any[] | null) ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const status = o.status as any;

  return (
    <>
      <Link to="/erp/orders" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-3 w-3" /> Ventas
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-6 gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-1 truncate">
            {o.order_number}{o.invoice_number ? ` · Fact. ${o.invoice_number}` : ""}
          </p>
          <h1 className="font-display text-2xl font-semibold break-words">{o.customer_name ?? "Sin cliente"}</h1>
          <p className="text-sm text-muted-foreground">
            Creado {new Date(o.created_at).toLocaleString("es-CO")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {status && <StatusBadge name={status.name} color={status.color} />}
          {!editing ? (
            <>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> Editar
              </Button>
              <Button variant="outline" size="icon" className="text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={() => { if (confirm("¿Eliminar esta venta?")) deleteMutation.mutate(); }}
                aria-label="Eliminar venta">
                <Trash2 className="h-4 w-4" />
              </Button>
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

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="rounded-xl border border-border bg-surface p-5">
            <p className="text-sm font-medium mb-3">Productos</p>
            {editing ? (
              <OrderItemsEditor items={editItems} onChange={setEditItems} />
            ) : (
              <>
                {/* Desktop: tabla */}
                <table className="hidden md:table w-full text-sm table-fixed">
                  <colgroup>
                    <col />
                    <col className="w-16" />
                    <col className="w-32" />
                    <col className="w-32" />
                  </colgroup>
                  <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left py-2">Descripción</th>
                      <th className="text-right py-2">Cant.</th>
                      <th className="text-right py-2">Precio</th>
                      <th className="text-right py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => {
                      const imgs: string[] = Array.isArray(it.images) ? it.images : [];
                      return (
                        <tr key={it.id} className="border-t border-border align-top">
                          <td className="py-2 pr-3 break-words whitespace-pre-wrap">
                            <p>{it.description}</p>
                            {imgs.length > 0 && (
                              <div className="mt-2 flex gap-1.5 flex-wrap">
                                {imgs.map((u) => (
                                  <a key={u} href={u} target="_blank" rel="noreferrer" className="block h-14 w-14 rounded border border-border overflow-hidden bg-muted hover:border-accent/60">
                                    <img src={u} alt="" className="h-full w-full object-cover" />
                                  </a>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="py-2 text-right tabular-nums">{Number(it.quantity)}</td>
                          <td className="py-2 text-right tabular-nums">{formatMoney(it.unit_price)}</td>
                          <td className="py-2 text-right tabular-nums">{formatMoney(it.line_total)}</td>
                        </tr>
                      );
                    })}

                  </tbody>
                  <tfoot>
                    <Row label="Subtotal" value={formatMoney(o.subtotal)} />
                    <Row label="Descuento" value={`- ${formatMoney(o.discount)}`} />
                    <Row label="Impuesto" value={`+ ${formatMoney(o.tax)}`} />
                    <Row label="Total" value={formatMoney(o.total)} bold />
                  </tfoot>
                </table>

                {/* Mobile: tarjetas */}
                <div className="md:hidden space-y-3">
                  {items.map((it) => {
                    const imgs: string[] = Array.isArray(it.images) ? it.images : [];
                    return (
                      <div key={it.id} className="rounded-lg border border-border p-3">
                        <p className="text-sm font-medium break-words whitespace-pre-wrap mb-2">{it.description}</p>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <p className="text-muted-foreground uppercase tracking-wider">Cant.</p>
                            <p className="tabular-nums font-medium mt-0.5">{Number(it.quantity)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-muted-foreground uppercase tracking-wider">Precio</p>
                            <p className="tabular-nums font-medium mt-0.5">{formatMoney(it.unit_price)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-muted-foreground uppercase tracking-wider">Total</p>
                            <p className="tabular-nums font-semibold mt-0.5">{formatMoney(it.line_total)}</p>
                          </div>
                        </div>
                        {imgs.length > 0 && (
                          <div className="mt-2 flex gap-1.5 flex-wrap">
                            {imgs.map((u) => (
                              <a key={u} href={u} target="_blank" rel="noreferrer" className="block h-14 w-14 rounded border border-border overflow-hidden bg-muted">
                                <img src={u} alt="" className="h-full w-full object-cover" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div className="rounded-lg border border-border p-3 space-y-1.5 text-sm">
                    <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="tabular-nums">{formatMoney(o.subtotal)}</span></div>
                    <div className="flex justify-between text-muted-foreground"><span>Descuento</span><span className="tabular-nums">- {formatMoney(o.discount)}</span></div>
                    <div className="flex justify-between text-muted-foreground"><span>Impuesto</span><span className="tabular-nums">+ {formatMoney(o.tax)}</span></div>
                    <div className="flex justify-between pt-1.5 border-t border-border font-semibold"><span>Total</span><span className="tabular-nums">{formatMoney(o.total)}</span></div>
                  </div>
                </div>
              </>
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
                {historyQuery.data!.map((h: any) => (
                  <li key={h.id} className="text-sm">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {h.from && <StatusBadge name={h.from.name} color={h.from.color} />}
                      {h.from && <span className="text-muted-foreground">→</span>}
                      {h.to && <StatusBadge name={h.to.name} color={h.to.color} />}
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
                ))}
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
            <p className="text-sm font-medium mb-2">Cliente</p>
            <p className="text-sm font-semibold">{o.customer_name ?? "—"}</p>
            {o.customer_company && <p className="text-xs text-muted-foreground">{o.customer_company}</p>}
            {o.customer_doc_number && (
              <p className="text-xs text-muted-foreground">
                {(o.customer_doc_type ? `${o.customer_doc_type} ` : "")}{o.customer_doc_number}
              </p>
            )}
            {o.customer_phone && <p className="text-xs text-muted-foreground">{o.customer_phone}</p>}
            {o.customer_email && <p className="text-xs text-muted-foreground">{o.customer_email}</p>}
            {(o.customer_address || o.customer_city || o.customer_department) && (
              <p className="text-xs text-muted-foreground">
                {[o.customer_address, o.customer_city, o.customer_department].filter(Boolean).join(", ")}
              </p>
            )}
            {(o.payment_method || o.advance_amount > 0) && (
              <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground space-y-0.5">
                {o.payment_method && <p>Pago: <span className="text-foreground">{o.payment_method}</span></p>}
                {o.advance_amount > 0 && <p>Abono: <span className="text-foreground tabular-nums">{formatMoney(o.advance_amount)}</span></p>}
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
    </>
  );
}


function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <tr className={bold ? "border-t border-border" : ""}>
      <td colSpan={3} className={`py-1.5 text-right text-xs uppercase tracking-wider text-muted-foreground ${bold ? "pt-3" : ""}`}>{label}</td>
      <td className={`py-1.5 text-right tabular-nums ${bold ? "font-display text-lg font-semibold pt-3" : ""}`}>{value}</td>
    </tr>
  );
}
