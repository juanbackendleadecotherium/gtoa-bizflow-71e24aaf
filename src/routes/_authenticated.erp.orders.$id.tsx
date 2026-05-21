import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Loader2, Trash2, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { StatusBadge } from "@/features/orders/status-badge";
import { formatMoney } from "@/features/orders/order-items-editor";

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
          id, order_number, status_id, notes, subtotal, discount, tax, total, created_at, brand_id,
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

  const [newStatus, setNewStatus] = useState("");
  const [statusNote, setStatusNote] = useState("");

  const changeStatus = useMutation({
    mutationFn: async () => {
      if (!newStatus) throw new Error("Selecciona un estado");
      const { error } = await supabase.from("orders").update({ status_id: newStatus }).eq("id", id);
      if (error) throw error;
      if (statusNote.trim()) {
        // append note to most recent history row (insert via trigger doesn't include note for updates)
        const { data: rows } = await supabase
          .from("order_status_history").select("id")
          .eq("order_id", id).order("created_at", { ascending: false }).limit(1);
        if (rows && rows[0]) {
          await supabase.from("order_status_history").update({ note: statusNote.trim() }).eq("id", rows[0].id);
        }
      }
    },
    onSuccess: () => {
      toast.success("Estado actualizado");
      setStatusNote("");
      setNewStatus("");
      qc.invalidateQueries({ queryKey: ["order", id] });
      qc.invalidateQueries({ queryKey: ["order-history", id] });
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
  const o = orderQuery.data;
  if (!o) return <p className="text-sm text-muted-foreground">Pedido no encontrado.</p>;

  const customer = o.customer as any;
  const status = o.status as any;
  const items = (o.items as any[] | null) ?? [];
  items.sort((a, b) => a.sort_order - b.sort_order);

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
          </div>

          {o.notes && (
            <div className="rounded-xl border border-border bg-surface p-5">
              <p className="text-sm font-medium mb-2">Notas</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{o.notes}</p>
            </div>
          )}

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
              <ol className="space-y-3">
                {historyQuery.data!.map((h: any) => (
                  <li key={h.id} className="flex items-start gap-3 text-sm">
                    <span className="text-xs text-muted-foreground w-32 shrink-0">
                      {new Date(h.created_at).toLocaleString("es-CO")}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {h.from && <StatusBadge name={h.from.name} color={h.from.color} />}
                        {h.from && <span className="text-muted-foreground">→</span>}
                        {h.to && <StatusBadge name={h.to.name} color={h.to.color} />}
                      </div>
                      {h.note && <p className="text-xs text-muted-foreground mt-1">{h.note}</p>}
                    </div>
                  </li>
                ))}
              </ol>
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
                <Label className="text-xs mb-1.5 block text-muted-foreground">Nota (opcional)</Label>
                <Textarea rows={2} value={statusNote} onChange={(e) => setStatusNote(e.target.value)} />
              </div>
              <Button onClick={() => changeStatus.mutate()} disabled={!newStatus || changeStatus.isPending} className="w-full">
                {changeStatus.isPending ? "Actualizando…" : "Actualizar estado"}
              </Button>
            </div>
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
