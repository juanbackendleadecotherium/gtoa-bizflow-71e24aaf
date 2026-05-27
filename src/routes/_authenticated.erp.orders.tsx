import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/features/orders/status-badge";
import { formatMoney } from "@/features/orders/order-items-editor";

export const Route = createFileRoute("/_authenticated/erp/orders")({
  component: OrdersPage,
});

function OrdersPage() {
  const { selectedBrandId, selectedBrand } = useBrand();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

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
        .select("id, order_number, total, created_at, status_id, customer:customers(display_name), status:order_statuses(name,color)")
        .eq("brand_id", selectedBrandId!)
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") q = q.eq("status_id", statusFilter);
      if (search.trim()) q = q.ilike("order_number", `%${search.trim()}%`);
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
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-1">{selectedBrand?.name}</p>
          <h1 className="font-display text-2xl font-semibold">Pedidos</h1>
          <p className="text-sm text-muted-foreground">Registra y da seguimiento a los pedidos de la marca.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link to="/erp/orders/whatsapp"><Sparkles className="h-4 w-4 text-accent" /> Desde WhatsApp</Link>
          </Button>
          <Button asChild className="gap-2">
            <Link to="/erp/orders/new"><Plus className="h-4 w-4" /> Nuevo pedido</Link>
          </Button>
        </div>
      </div>

      <div className="mb-4 flex gap-2 flex-wrap">
        <Input className="max-w-xs" placeholder="Buscar por número…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
          <div className="p-8 text-center text-sm text-muted-foreground">Sin pedidos todavía.</div>
        ) : (
          <table className="w-full text-sm">
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
              {ordersQuery.data!.map((o) => (
                <tr key={o.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link to="/erp/orders/$id" params={{ id: o.id }} className="font-medium hover:text-accent">
                      {o.order_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{(o.customer as any)?.display_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    {o.status ? <StatusBadge name={(o.status as any).name} color={(o.status as any).color} /> : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(o.total)}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(o.created_at).toLocaleDateString("es-CO")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
