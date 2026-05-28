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
import { MoneyInput } from "@/features/orders/money-input";
import type { OrderItemInput } from "@/features/orders/schemas";
import { AuditTimeline, type AuditRow } from "@/features/orders/audit-timeline";

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
          id, order_number, status_id, notes, subtotal, discount, tax, total, created_at, brand_id, estimated_delivery_date,
          customer:customers(id, display_name, email, phone),
          status:order_statuses(id, name, color),
          items:order_items(id, description, quantity, unit_price, line_total, sort_order)
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
      const note = statusNote.trim() || null;
      const { error } = await supabase.rpc("update_order_status", {
        p_order_id: id,
        p_status_id: newStatus,
        p_note: note,
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

  const customer = o.customer as any;
  const status = o.status as any;
  const items = ((o.items as any[] | null) ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);

  return (
    <>
      <Link to="/erp/orders" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-3 w-3" /> Pedidos
      </Link>

      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-1">{o.order_number}</p>
          <h1 className="font-display text-2xl font-semibold">{customer?.display_name}</h1>
          <p className="text-sm text-muted-foreground">
            Creado {new Date(o.created_at).toLocaleString("es-CO")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status && <StatusBadge name={status.name} color={status.color} />}
          {!editing ? (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Editar
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="gap-2" onClick={() => {
                if (confirm("¿Descartar los cambios sin guardar?")) {
                  hydratedFor.current = null;
                  setEditing(false);
                }
              }}>
                <X className="h-4 w-4" /> Cancelar
              </Button>
              <Button size="sm" onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>
                {saveEdit.isPending ? "Guardando…" : "Guardar cambios"}
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10"
            onClick={() => { if (confirm("¿Eliminar este pedido?")) deleteMutation.mutate(); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="rounded-xl border border-border bg-surface p-5">
            <p className="text-sm font-medium mb-3">Items</p>
            {editing ? (
              <OrderItemsEditor items={editItems} onChange={setEditItems} />
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left py-2">Descripción</th>
                    <th className="text-right py-2 w-20">Cant.</th>
                    <th className="text-right py-2 w-28">Precio</th>
                    <th className="text-right py-2 w-28">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-t border-border">
                      <td className="py-2">{it.description}</td>
                      <td className="py-2 text-right tabular-nums">{Number(it.quantity)}</td>
                      <td className="py-2 text-right tabular-nums">{formatMoney(it.unit_price)}</td>
                      <td className="py-2 text-right tabular-nums">{formatMoney(it.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <Row label="Subtotal" value={formatMoney(o.subtotal)} />
                  <Row label="Descuento" value={`- ${formatMoney(o.discount)}`} />
                  <Row label="Impuesto" value={`+ ${formatMoney(o.tax)}`} />
                  <Row label="Total" value={formatMoney(o.total)} bold />
                </tfoot>
              </table>
            )}

            {editing && (
              <div className="grid sm:grid-cols-3 gap-3 mt-4">
                <div>
                  <Label className="text-xs mb-1.5 block text-muted-foreground">Descuento</Label>
                  <MoneyInput allowDecimals value={editDiscount} onValueChange={setEditDiscount} />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block text-muted-foreground">Impuesto</Label>
                  <MoneyInput allowDecimals value={editTax} onValueChange={setEditTax} />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block text-muted-foreground">Entrega estimada</Label>
                  <Input type="date" value={editETA ?? ""} onChange={(e) => setEditETA(e.target.value)} />
                </div>
              </div>
            )}
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
          <div className="rounded-xl border border-border bg-surface p-5">
            <p className="text-sm font-medium mb-3">Cliente</p>
            <p className="text-sm font-semibold">{customer?.display_name}</p>
            {customer?.email && <p className="text-xs text-muted-foreground">{customer.email}</p>}
            {customer?.phone && <p className="text-xs text-muted-foreground">{customer.phone}</p>}
            {customer?.id && (
              <Button variant="link" size="sm" asChild className="px-0 mt-2">
                <Link to="/erp/customers/$id" params={{ id: customer.id }}>Ver ficha →</Link>
              </Button>
            )}
          </div>

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
