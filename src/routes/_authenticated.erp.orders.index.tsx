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
import { PaymentBadge, InvoicedBadge } from "@/features/invoices/invoice-badges";
import { SaleTypeBadge, ApprovalStatusBadge } from "@/features/orders/sale-type-badge";
import { getDeliveryUrgency, urgencyChipClasses, formatDeliveryDate } from "@/features/orders/delivery-urgency";

export const Route = createFileRoute("/_authenticated/erp/orders/")({
  component: OrdersPage,
});

function OrdersPage() {
  const { selectedBrandId, selectedBrand, brands } = useBrand();
  // Filtro por marca del listado: por defecto usa la marca activa del selector global,
  // pero el vendedor puede alternar entre las marcas a las que tiene acceso o ver "Todas".
  const [brandFilter, setBrandFilter] = useState<string>("__default__");
  const effectiveBrandFilter = brandFilter === "__default__" ? (selectedBrandId ?? "all") : brandFilter;
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
    queryKey: ["orders", effectiveBrandFilter, statusFilter, search],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("id, order_number, invoice_number, total, advance_amount, created_at, estimated_delivery_date, status_id, brand_id, customer_name, customer_phone, customer_doc_number, sale_type, separe_completed_at, approval_status, brand:brands(name, invoice_prefix), status:order_statuses(name,color), invoices(id), items:order_items(description, quantity, sort_order)")
        .order("created_at", { ascending: false });
      if (effectiveBrandFilter !== "all") q = q.eq("brand_id", effectiveBrandFilter);
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

  const summarizeItems = (items: Array<{ description: string | null; quantity: number; sort_order: number | null }> | null | undefined) => {
    if (!items || items.length === 0) return "Sin productos";
    const sorted = [...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const firstWords = (desc: string | null) => {
      const w = (desc || "—").trim().split(/\s+/);
      return w.slice(0, 3).join(" ") + (w.length > 3 ? "…" : "");
    };
    const totalQty = sorted.reduce((s, i) => s + Number(i.quantity || 0), 0);
    if (sorted.length === 1) return `${firstWords(sorted[0].description)} · ${totalQty} und`;
    return `${firstWords(sorted[0].description)} +${sorted.length - 1} más · ${totalQty} und`;
  };


  if (!selectedBrandId) {
    return <p className="text-sm text-muted-foreground">Selecciona una marca para ver sus ventas.</p>;
  }

  return (
    <>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-1">{selectedBrand?.name}</p>
          <h1 className="font-display text-2xl font-semibold">Ventas</h1>
          <p className="text-sm text-muted-foreground">Toda la operación gira alrededor de la venta: cliente, productos y estados.</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="gap-2 self-start sm:self-auto">
          <Plus className="h-4 w-4" /> Nueva venta
        </Button>
      </div>

      {/* Tabs por marca */}
      {brands.length > 1 && (
        <div className="mb-4 flex gap-1.5 flex-wrap border-b border-border pb-2">
          <button
            type="button"
            onClick={() => setBrandFilter("all")}
            className={`px-3 py-1.5 text-xs rounded-md transition ${
              effectiveBrandFilter === "all"
                ? "bg-foreground text-background font-medium"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Todas
          </button>
          {brands.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBrandFilter(b.id)}
              className={`px-3 py-1.5 text-xs rounded-md transition ${
                effectiveBrandFilter === b.id
                  ? "bg-foreground text-background font-medium"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      <div className="mb-4 flex gap-2 flex-wrap">
        <Input
          className="max-w-xs"
          placeholder="Buscar por número, cuenta de cobro, cliente, teléfono o documento…"
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
            Aún no hay ventas. Crea la primera con el botón <strong>Nueva venta</strong>.
          </div>
        ) : (
          <>
            {/* Desktop */}
            <table className="hidden md:table w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Cuenta de cobro</th>
                  <th className="text-left px-4 py-3">Producto</th>
                  <th className="text-left px-4 py-3">Estado</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-left px-4 py-3">Entrega</th>
                </tr>
              </thead>
              <tbody>
                {ordersQuery.data!.map((o: any) => {
                  const { urgency, label: urgencyLabel } = getDeliveryUrgency(o.estimated_delivery_date);
                  return (
                  <tr key={o.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link to="/erp/orders/$id" params={{ id: o.id }} className="font-medium hover:text-accent">
                        {o.invoice_number ? `Fact. ${o.invoice_number}` : o.order_number}
                      </Link>
                      {o.invoice_number && (
                        <p className="text-[11px] text-muted-foreground font-mono">{o.order_number}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground">{summarizeItems(o.items)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {o.status ? <StatusBadge name={o.status.name} color={o.status.color} /> : "—"}
                        <PaymentBadge total={Number(o.total)} advance={Number(o.advance_amount || 0)} />
                        {o.sale_type === "plan_separe" && <SaleTypeBadge saleType={o.sale_type} separeCompletedAt={o.separe_completed_at} />}
                        <ApprovalStatusBadge status={o.approval_status} />
                        {o.invoices?.length > 0 && <InvoicedBadge />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoney(o.total)}</td>
                    <td className="px-4 py-3">
                      <div className={`inline-flex flex-col items-start gap-0.5 rounded-md px-2 py-1 text-xs font-medium ${urgencyChipClasses(urgency)}`}>
                        <span className="tabular-nums">{formatDeliveryDate(o.estimated_delivery_date)}</span>
                        {urgency !== "none" && urgency !== "normal" && (
                          <span className="text-[10px] font-normal opacity-90">{urgencyLabel}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-border">
              {ordersQuery.data!.map((o: any) => {
                const { urgency, label: urgencyLabel } = getDeliveryUrgency(o.estimated_delivery_date);
                return (
                <Link
                  key={o.id}
                  to="/erp/orders/$id"
                  params={{ id: o.id }}
                  className="flex flex-col gap-1.5 px-4 py-3 hover:bg-muted/30"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-medium">
                      {o.invoice_number ? `Fact. ${o.invoice_number}` : o.order_number}
                    </span>
                    {o.status && <StatusBadge name={o.status.name} color={o.status.color} />}
                  </div>
                  <p className="text-sm">{summarizeItems(o.items)}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <PaymentBadge total={Number(o.total)} advance={Number(o.advance_amount || 0)} />
                    {o.sale_type === "plan_separe" && <SaleTypeBadge saleType={o.sale_type} separeCompletedAt={o.separe_completed_at} />}
                    <ApprovalStatusBadge status={o.approval_status} />
                    {o.invoices?.length > 0 && <InvoicedBadge />}
                  </div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${urgencyChipClasses(urgency)}`}>
                      <span>{formatDeliveryDate(o.estimated_delivery_date)}</span>
                      {urgency !== "none" && urgency !== "normal" && (
                        <span className="opacity-90">· {urgencyLabel}</span>
                      )}
                    </span>
                    <span className="tabular-nums font-medium text-foreground text-sm">{formatMoney(o.total)}</span>
                  </div>
                </Link>
                );
              })}
            </div>

          </>
        )}
      </div>

      <NewCustomerDialog open={newOpen} onOpenChange={setNewOpen} />
    </>
  );
}
