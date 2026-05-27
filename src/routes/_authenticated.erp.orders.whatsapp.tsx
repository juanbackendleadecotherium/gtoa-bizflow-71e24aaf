import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Sparkles, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { parseWhatsAppOrder } from "@/lib/whatsapp.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/features/orders/order-items-editor";

export const Route = createFileRoute("/_authenticated/erp/orders/whatsapp")({
  component: WhatsAppCapture,
});

type Extracted = {
  customer: { display_name: string; phone: string; address: string; city: string };
  items: { description: string; quantity: number; unit_price: number }[];
  notes: string;
  total_estimated: number;
};

function WhatsAppCapture() {
  const { selectedBrandId } = useBrand();
  const navigate = useNavigate();
  const parseFn = useServerFn(parseWhatsAppOrder);

  const [rawText, setRawText] = useState("");
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [estimatedDate, setEstimatedDate] = useState("");

  const parseMutation = useMutation({
    mutationFn: async () => parseFn({ data: { text: rawText } }),
    onSuccess: (data) => {
      setExtracted(data as Extracted);
      toast.success("Datos extraídos. Revisa antes de guardar.");
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo procesar el texto"),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!extracted || !selectedBrandId) throw new Error("Falta marca o datos");
      const c = extracted.customer;
      if (!c.display_name.trim()) throw new Error("El nombre del cliente es obligatorio");
      if (extracted.items.length === 0) throw new Error("Agrega al menos un item");

      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;

      // 1) Find or create customer (match by phone within brand)
      let customerId: string | null = null;
      if (c.phone.trim()) {
        const { data: existing } = await supabase
          .from("customers")
          .select("id")
          .eq("brand_id", selectedBrandId)
          .eq("phone", c.phone.trim())
          .maybeSingle();
        if (existing) customerId = existing.id;
      }
      if (!customerId) {
        const { data: newCustomer, error: custErr } = await supabase
          .from("customers")
          .insert({
            brand_id: selectedBrandId,
            display_name: c.display_name.trim(),
            phone: c.phone.trim() || null,
            address: c.address.trim() || null,
            city: c.city.trim() || null,
            created_by: userId,
          } as never)
          .select("id")
          .single();
        if (custErr) throw custErr;
        customerId = newCustomer.id;
      }

      // 2) Initial status
      const { data: status } = await supabase
        .from("order_statuses")
        .select("id")
        .eq("brand_id", selectedBrandId)
        .eq("is_active", true)
        .order("sort_order")
        .limit(1)
        .maybeSingle();
      if (!status) throw new Error("No hay estados configurados para esta marca");

      // 3) Create order
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          brand_id: selectedBrandId,
          customer_id: customerId,
          status_id: status.id,
          notes: extracted.notes || null,
          order_number: "",
          created_by: userId,
          seller_id: userId,
          source: "whatsapp",
          whatsapp_raw: rawText,
          estimated_delivery_date: estimatedDate || null,
        } as never)
        .select()
        .single();
      if (orderErr) throw orderErr;

      // 4) Items
      const itemsPayload = extracted.items.map((it, idx) => ({
        order_id: order.id,
        description: it.description || "Sin descripción",
        quantity: Number(it.quantity) || 1,
        unit_price: Number(it.unit_price) || 0,
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

  const updateCustomer = (field: keyof Extracted["customer"], value: string) => {
    if (!extracted) return;
    setExtracted({ ...extracted, customer: { ...extracted.customer, [field]: value } });
  };
  const updateItem = (idx: number, field: "description" | "quantity" | "unit_price", value: string) => {
    if (!extracted) return;
    const items = [...extracted.items];
    items[idx] = {
      ...items[idx],
      [field]: field === "description" ? value : Number(value) || 0,
    };
    setExtracted({ ...extracted, items });
  };
  const addItem = () => {
    if (!extracted) return;
    setExtracted({
      ...extracted,
      items: [...extracted.items, { description: "", quantity: 1, unit_price: 0 }],
    });
  };
  const removeItem = (idx: number) => {
    if (!extracted) return;
    setExtracted({ ...extracted, items: extracted.items.filter((_, i) => i !== idx) });
  };

  const subtotal = extracted?.items.reduce((s, it) => s + it.quantity * it.unit_price, 0) ?? 0;

  return (
    <>
      <Link to="/erp/orders" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-3 w-3" /> Pedidos
      </Link>
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="h-5 w-5 text-accent" />
        <h1 className="font-display text-2xl font-semibold">Nuevo pedido desde WhatsApp</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Pega la conversación o el resumen del cliente y la IA extrae cliente, productos y observaciones.
      </p>

      <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
        <Label className="text-xs text-muted-foreground">Texto de WhatsApp</Label>
        <Textarea
          rows={10}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Pega aquí la conversación, el audio transcrito o el resumen del pedido…"
          className="font-mono text-xs"
        />
        <div className="flex justify-end">
          <Button
            onClick={() => parseMutation.mutate()}
            disabled={parseMutation.isPending || rawText.trim().length < 10}
          >
            {parseMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analizando…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" /> Extraer con IA</>
            )}
          </Button>
        </div>
      </div>

      {extracted && (
        <div className="mt-5 space-y-5">
          <div className="rounded-xl border border-border bg-surface p-5 grid sm:grid-cols-2 gap-4">
            <p className="sm:col-span-2 text-sm font-medium">Cliente detectado</p>
            <div>
              <Label className="text-xs mb-1.5 block text-muted-foreground">Nombre *</Label>
              <Input value={extracted.customer.display_name} onChange={(e) => updateCustomer("display_name", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block text-muted-foreground">Teléfono</Label>
              <Input value={extracted.customer.phone} onChange={(e) => updateCustomer("phone", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block text-muted-foreground">Dirección</Label>
              <Input value={extracted.customer.address} onChange={(e) => updateCustomer("address", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block text-muted-foreground">Ciudad</Label>
              <Input value={extracted.customer.city} onChange={(e) => updateCustomer("city", e.target.value)} />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">Productos</p>
              <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" />Agregar</Button>
            </div>
            <div className="space-y-2">
              {extracted.items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                  <Input
                    className="col-span-7"
                    placeholder="Descripción"
                    value={it.description}
                    onChange={(e) => updateItem(idx, "description", e.target.value)}
                  />
                  <Input
                    className="col-span-2 text-right"
                    type="number" step="0.01" min="0"
                    value={it.quantity}
                    onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                  />
                  <Input
                    className="col-span-2 text-right"
                    type="number" step="1" min="0"
                    value={it.unit_price}
                    onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                  />
                  <Button size="icon" variant="ghost" className="col-span-1" onClick={() => removeItem(idx)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {extracted.items.length === 0 && (
                <p className="text-xs text-muted-foreground">Sin productos detectados. Agrega manualmente.</p>
              )}
            </div>
            <div className="mt-4 text-right text-sm">
              <span className="text-muted-foreground mr-2">Subtotal estimado</span>
              <span className="font-display font-semibold text-lg tabular-nums">{formatMoney(subtotal)}</span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5 grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label className="text-xs mb-1.5 block text-muted-foreground">Observaciones</Label>
              <Textarea
                rows={3}
                value={extracted.notes}
                onChange={(e) => setExtracted({ ...extracted, notes: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block text-muted-foreground">Fecha estimada de entrega</Label>
              <Input type="date" value={estimatedDate} onChange={(e) => setEstimatedDate(e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setExtracted(null)}>Descartar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Guardando…" : "Crear pedido"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
