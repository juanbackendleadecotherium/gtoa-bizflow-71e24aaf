import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
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
import { OrderItemsEditor, formatMoney } from "@/features/orders/order-items-editor";
import { orderSchema, type OrderItemInput } from "@/features/orders/schemas";

export const Route = createFileRoute("/_authenticated/erp/orders/new")({
  component: NewOrder,
});

function NewOrder() {
  const { selectedBrandId } = useBrand();
  const navigate = useNavigate();

  const customersQuery = useQuery({
    queryKey: ["customers-options", selectedBrandId],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers").select("id, display_name")
        .eq("brand_id", selectedBrandId!).eq("is_active", true).order("display_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const statusesQuery = useQuery({
    queryKey: ["statuses", selectedBrandId],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_statuses").select("id, name, is_initial, sort_order")
        .eq("brand_id", selectedBrandId!).eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [customerId, setCustomerId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [items, setItems] = useState<OrderItemInput[]>([
    { description: "", quantity: 1, unit_price: 0, sort_order: 0 },
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const initialStatusId = statusesQuery.data?.find((s) => s.is_initial)?.id ?? statusesQuery.data?.[0]?.id ?? "";
  const effectiveStatusId = statusId || initialStatusId;

  const subtotal = items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);
  const total = subtotal - Number(discount || 0) + Number(tax || 0);

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        customer_id: customerId,
        status_id: effectiveStatusId,
        notes,
        discount,
        tax,
        items,
      };
      const parsed = orderSchema.safeParse(payload);
      if (!parsed.success) {
        const errs: Record<string, string> = {};
        parsed.error.issues.forEach((i) => { errs[i.path.join(".")] = i.message; });
        setErrors(errs);
        throw new Error("Revisa el formulario");
      }
      setErrors({});

      const { data: { user } } = await supabase.auth.getUser();
      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          brand_id: selectedBrandId!,
          customer_id: parsed.data.customer_id,
          status_id: parsed.data.status_id!,
          notes: parsed.data.notes || null,
          discount: parsed.data.discount,
          tax: parsed.data.tax,
          order_number: "", // trigger will fill
          created_by: user?.id,
        } as any)
        .select()
        .single();
      if (error) throw error;

      const itemsPayload = parsed.data.items.map((it, idx) => ({
        order_id: order.id,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        sort_order: idx,
      }));
      const { error: itemsErr } = await supabase.from("order_items").insert(itemsPayload);
      if (itemsErr) throw itemsErr;

      return order;
    },
    onSuccess: (order) => {
      toast.success(`Pedido ${order.order_number} creado`);
      navigate({ to: "/erp/orders/$id", params: { id: order.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Link to="/erp/orders" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-3 w-3" /> Pedidos
      </Link>
      <h1 className="font-display text-2xl font-semibold mb-6">Nuevo pedido</h1>

      <div className="space-y-5">
        <div className="rounded-xl border border-border bg-surface p-5 grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Cliente *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder="Selecciona un cliente" /></SelectTrigger>
              <SelectContent>
                {(customersQuery.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.customer_id && <p className="text-xs text-destructive mt-1">{errors.customer_id}</p>}
          </div>
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Estado inicial</Label>
            <Select value={effectiveStatusId} onValueChange={setStatusId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(statusesQuery.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs mb-1.5 block text-muted-foreground">Notas</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-sm font-medium mb-3">Items</p>
          <OrderItemsEditor items={items} onChange={setItems} />
          {errors.items && <p className="text-xs text-destructive mt-2">{errors.items}</p>}

          <div className="mt-4 grid sm:grid-cols-3 gap-3 max-w-md ml-auto text-sm">
            <Label className="text-xs text-muted-foreground self-center sm:col-span-2 text-right">Descuento</Label>
            <Input type="number" step="0.01" min="0" className="text-right" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
            <Label className="text-xs text-muted-foreground self-center sm:col-span-2 text-right">Impuesto</Label>
            <Input type="number" step="0.01" min="0" className="text-right" value={tax} onChange={(e) => setTax(Number(e.target.value))} />
            <p className="text-sm text-muted-foreground self-center sm:col-span-2 text-right uppercase tracking-wider">Total</p>
            <p className="text-right font-semibold font-display text-lg tabular-nums">{formatMoney(total)}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" asChild><Link to="/erp/orders">Cancelar</Link></Button>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creando…" : "Crear pedido"}
          </Button>
        </div>
      </div>
    </>
  );
}
