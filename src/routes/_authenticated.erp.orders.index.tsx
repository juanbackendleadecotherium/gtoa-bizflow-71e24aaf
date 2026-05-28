import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/features/orders/status-badge";
import { formatMoney } from "@/features/orders/order-items-editor";
import { NewCustomerDialog } from "@/features/customers/new-customer-dialog";

export const Route = createFileRoute("/_authenticated/erp/orders/")({
  component: OrdersPage,
});

function OrdersPage() {
  const { selectedBrandId, selectedBrand } = useBrand();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  const statusesQuery = useQuery({
    queryKey: ["statuses", selectedBrandId],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_statuses").select("id, name, color, sort_order")
        .eq("brand_id", selectedBrandId!).order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const ordersQuery = useQuery({
    queryKey: ["orders", selectedBrandId, statusFilter, search],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("id, order_number, invoice_number, total, created_at, status_id, customer_name, customer_phone, customer_doc_number, status:order_statuses(name,color)")
        .eq("brand_id", selectedBrandId!)
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") q = q.eq("status_id", statusFilter);
      const term = search.trim();
      if (term) {
        const like = `%${term}%`;
        q = q.or(
          `order_number.ilike.${like},invoice_number.ilike.${like},customer_name.ilike.${like},customer_phone.ilike.${like},customer_doc_number.ilike.${like}`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!selectedBrandId) {
    return <p className="text-sm text-muted-foreground">Selecciona una marca para ver sus pedidos.</p>;
  }

  return (
    <>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-1">{selectedBrand?.name}</p>
          <h1 className="font-display text-2xl font-semibold">Pedidos</h1>
          <p className="text-sm text-muted-foreground">Toda la operación gira alrededor del pedido: cliente, productos y estados.</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="gap-2 self-start sm:self-auto">
          <Plus className="h-4 w-4" /> Nuevo pedido
        </Button>
      </div>

      <div className="mb-4 flex gap-2 flex-wrap">
        <Input
          className="max-w-xs"
          placeholder="Buscar por número, factura, cliente, teléfono o documento…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {(statusesQuery.data ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        {ordersQuery.isLoading ? (
          <div className="p-8 grid place-items-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : (ordersQuery.data ?? []).length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Aún no hay pedidos. Crea el primero con el botón <strong>Nuevo pedido</strong>.
          </div>
        ) : (
          <>
            {/* Desktop */}
            <table className="hidden md:table w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Número</th>
                  <th className="text-left px-4 py-3">Cliente</th>
                  <th className="text-left px-4 py-3">Estado</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-left px-4 py-3">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {ordersQuery.data!.map((o: any) => (
                  <tr key={o.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link to="/erp/orders/$id" params={{ id: o.id }} className="font-medium hover:text-accent">
                        {o.order_number}
                      </Link>
                      {o.invoice_number && (
                        <p className="text-[11px] text-muted-foreground">Fact. {o.invoice_number}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-foreground">{o.customer_name ?? "—"}</p>
                      {o.customer_phone && <p className="text-[11px] text-muted-foreground">{o.customer_phone}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {o.status ? <StatusBadge name={o.status.name} color={o.status.color} /> : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoney(o.total)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(o.created_at).toLocaleDateString("es-CO")}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-border">
              {ordersQuery.data!.map((o: any) => (
                <Link
                  key={o.id}
                  to="/erp/orders/$id"
                  params={{ id: o.id }}
                  className="flex flex-col gap-1 px-4 py-3 hover:bg-muted/30"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{o.order_number}</span>
                    {o.status && <StatusBadge name={o.status.name} color={o.status.color} />}
                  </div>
                  <p className="text-sm">{o.customer_name ?? "—"}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{new Date(o.created_at).toLocaleDateString("es-CO")}</span>
                    <span className="tabular-nums font-medium text-foreground">{formatMoney(o.total)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      <NewCustomerDialog open={newOpen} onOpenChange={setNewOpen} />
    </>
  );
}
