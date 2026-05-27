import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  Sparkles,
  Loader2,
  User,
  Package,
  FileText,
  Plus,
  Trash2,
  WandSparkles,
  MessageSquareText,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { parseWhatsAppOrder } from "@/lib/whatsapp.functions";
import { formatMoney } from "@/features/orders/order-items-editor";
import { MoneyInput } from "@/features/orders/money-input";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type Draft = {
  customer: {
    display_name: string;
    phone: string;
    email: string;
    doc_number: string;
    address: string;
    city: string;
    needs_summary: string;
    references: string;
  };
  items: { description: string; quantity: number; unit_price: number }[];
  notes: string;
  urgency: string;
  estimated_delivery_date: string;
};

const EMPTY: Draft = {
  customer: {
    display_name: "",
    phone: "",
    email: "",
    doc_number: "",
    address: "",
    city: "",
    needs_summary: "",
    references: "",
  },
  items: [],
  notes: "",
  urgency: "",
  estimated_delivery_date: "",
};

function buildCustomerNotes(c: Draft["customer"], urgency: string) {
  const parts: string[] = [];
  if (c.needs_summary) parts.push(`Necesidad: ${c.needs_summary}`);
  if (c.references) parts.push(`Referencias: ${c.references}`);
  if (urgency) parts.push(`Urgencia: ${urgency}`);
  return parts.join("\n");
}

export function NewCustomerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { selectedBrandId, selectedBrand } = useBrand();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const parseFn = useServerFn(parseWhatsAppOrder);

  const [rawText, setRawText] = useState("");
  const [aiOpen, setAiOpen] = useState(true);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const reset = () => {
    setRawText("");
    setDraft(EMPTY);
    setAiOpen(true);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const parseMutation = useMutation({
    mutationFn: async () => parseFn({ data: { text: rawText } }),
    onSuccess: (data) => {
      if (!data.success) {
        toast.error(data.message);
        return;
      }
      setDraft({
        customer: data.order.customer,
        items: data.order.items,
        notes: data.order.notes,
        urgency: data.order.urgency,
        estimated_delivery_date: data.order.estimated_delivery_date,
      });
      setAiOpen(false);
      toast.success("Datos extraídos. Revisa antes de guardar.");
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo procesar el texto"),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBrandId) throw new Error("Selecciona una marca");
      const c = draft.customer;
      if (!c.display_name.trim()) throw new Error("El nombre del cliente es obligatorio");
      if (draft.items.length === 0)
        throw new Error("Agrega al menos un producto para crear el pedido");

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const userId = user?.id;
      const customerNotes = buildCustomerNotes(c, draft.urgency);

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
            email: c.email.trim() || null,
            doc_number: c.doc_number.trim() || null,
            address: c.address.trim() || null,
            city: c.city.trim() || null,
            notes: customerNotes || null,
            created_by: userId,
          } as never)
          .select("id")
          .single();
        if (custErr) throw custErr;
        customerId = newCustomer.id;
      } else if (customerNotes) {
        await supabase
          .from("customers")
          .update({ notes: customerNotes } as never)
          .eq("id", customerId);
      }

      const { data: status } = await supabase
        .from("order_statuses")
        .select("id")
        .eq("brand_id", selectedBrandId)
        .eq("is_active", true)
        .order("sort_order")
        .limit(1)
        .maybeSingle();
      if (!status) throw new Error("No hay estados configurados para esta marca");

      const orderNotes = [draft.notes, draft.urgency && `Urgencia: ${draft.urgency}`]
        .filter(Boolean)
        .join("\n");

      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          brand_id: selectedBrandId,
          customer_id: customerId,
          status_id: status.id,
          notes: orderNotes || null,
          order_number: "",
          created_by: userId,
          seller_id: userId,
          source: rawText ? "whatsapp" : "manual",
          whatsapp_raw: rawText || null,
          estimated_delivery_date: draft.estimated_delivery_date || null,
        } as never)
        .select()
        .single();
      if (orderErr) throw orderErr;

      const itemsPayload = draft.items.map((it, idx) => ({
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
      toast.success(`Cliente y pedido ${order.order_number} creados`);
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      handleOpenChange(false);
      navigate({ to: "/erp/orders/$id", params: { id: order.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateCustomer = (field: keyof Draft["customer"], value: string) =>
    setDraft((d) => ({ ...d, customer: { ...d.customer, [field]: value } }));

  const updateItem = (
    idx: number,
    field: "description" | "quantity" | "unit_price",
    value: string,
  ) =>
    setDraft((d) => {
      const items = [...d.items];
      items[idx] = {
        ...items[idx],
        [field]: field === "description" ? value : Number(value) || 0,
      };
      return { ...d, items };
    });

  const addItem = () =>
    setDraft((d) => ({
      ...d,
      items: [...d.items, { description: "", quantity: 1, unit_price: 0 }],
    }));

  const removeItem = (idx: number) =>
    setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== idx) }));

  const subtotal = draft.items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
  const hasDetected =
    draft.customer.display_name.trim().length > 0 || draft.items.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0 gap-0 bg-background">
        {/* Hero header */}
        <div className="relative px-6 pt-6 pb-5 border-b border-border bg-gradient-to-br from-accent/10 via-background to-background">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
              backgroundSize: "18px 18px",
            }}
          />
          <DialogHeader className="relative">
            <div className="flex items-center gap-3">
              <div className="grid place-items-center h-10 w-10 rounded-xl bg-accent text-accent-foreground shadow-sm">
                <User className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <DialogTitle className="font-display text-xl">Nuevo cliente</DialogTitle>
                <DialogDescription className="text-xs">
                  Crea el cliente y su primer pedido en un solo paso.
                </DialogDescription>
              </div>
              {selectedBrand && (
                <Badge variant="outline" className="border-accent/40 text-accent text-[10px]">
                  {selectedBrand.name}
                </Badge>
              )}
            </div>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-5">
          {/* AI Capture */}
          <section
            className={`rounded-2xl border transition-colors ${
              aiOpen
                ? "border-accent/40 bg-gradient-to-br from-accent/[0.06] to-transparent"
                : "border-border bg-surface"
            }`}
          >
            <button
              type="button"
              onClick={() => setAiOpen((v) => !v)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
            >
              <div className="grid place-items-center h-9 w-9 rounded-lg bg-accent/15 text-accent">
                <WandSparkles className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium flex items-center gap-2">
                  Captura con IA desde WhatsApp
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent uppercase tracking-wider">
                    Recomendado
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Pega la conversación y la IA arma cliente + pedido por ti.
                </p>
              </div>
              <span className="text-xs text-muted-foreground">{aiOpen ? "Ocultar" : "Mostrar"}</span>
            </button>

            {aiOpen && (
              <div className="px-4 pb-4 space-y-3">
                <div className="relative">
                  <MessageSquareText className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                  <Textarea
                    rows={6}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Pega aquí la conversación de WhatsApp, audio transcrito o resumen del pedido…"
                    className="pl-9 font-mono text-xs resize-y"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">
                    También puedes diligenciar manualmente abajo.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => parseMutation.mutate()}
                    disabled={parseMutation.isPending || rawText.trim().length < 10}
                    className="gap-2"
                  >
                    {parseMutation.isPending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analizando…
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" /> Extraer con IA
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* Customer */}
          <SectionCard
            icon={<User className="h-4 w-4" />}
            title="Datos del cliente"
            subtitle={hasDetected ? "Revisa la información detectada" : "Completa los datos básicos"}
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <FieldBlock label="Nombre / razón social *">
                <Input
                  value={draft.customer.display_name}
                  onChange={(e) => updateCustomer("display_name", e.target.value)}
                  placeholder="Ej. Andrea Restrepo"
                />
              </FieldBlock>
              <FieldBlock label="Teléfono">
                <Input
                  value={draft.customer.phone}
                  onChange={(e) => updateCustomer("phone", e.target.value)}
                  placeholder="3001234567"
                />
              </FieldBlock>
              <FieldBlock label="Email">
                <Input
                  type="email"
                  value={draft.customer.email}
                  onChange={(e) => updateCustomer("email", e.target.value)}
                  placeholder="cliente@correo.com"
                />
              </FieldBlock>
              <FieldBlock label="Cédula / NIT">
                <Input
                  value={draft.customer.doc_number}
                  onChange={(e) => updateCustomer("doc_number", e.target.value)}
                />
              </FieldBlock>
              <FieldBlock label="Ciudad">
                <Input
                  value={draft.customer.city}
                  onChange={(e) => updateCustomer("city", e.target.value)}
                />
              </FieldBlock>
              <FieldBlock label="Dirección">
                <Input
                  value={draft.customer.address}
                  onChange={(e) => updateCustomer("address", e.target.value)}
                />
              </FieldBlock>
            </div>

            <div className="mt-4 grid gap-3 rounded-xl border border-accent/30 bg-accent/[0.04] p-4">
              <FieldBlock label="¿Qué necesita el cliente?">
                <Textarea
                  rows={2}
                  value={draft.customer.needs_summary}
                  onChange={(e) => updateCustomer("needs_summary", e.target.value)}
                  placeholder="Ej. Cocina integral en L para apartamento, acabado mate."
                />
              </FieldBlock>
              <FieldBlock label="Referencias / medidas / materiales">
                <Textarea
                  rows={2}
                  value={draft.customer.references}
                  onChange={(e) => updateCustomer("references", e.target.value)}
                  placeholder="Medidas, colores, enlaces, fotos descritas…"
                />
              </FieldBlock>
              <p className="text-[11px] text-muted-foreground">
                Este resumen queda en la ficha del cliente para no volver a preguntarlo.
              </p>
            </div>
          </SectionCard>

          {/* Items */}
          <SectionCard
            icon={<Package className="h-4 w-4" />}
            title="Productos del pedido"
            subtitle="Al menos un producto para abrir el pedido."
            action={
              <Button type="button" size="sm" variant="outline" onClick={addItem} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Agregar
              </Button>
            }
          >
            {draft.items.length === 0 ? (
              <button
                type="button"
                onClick={addItem}
                className="w-full rounded-lg border border-dashed border-border py-6 text-xs text-muted-foreground hover:border-accent/50 hover:text-accent transition"
              >
                Sin productos. Haz clic para agregar el primero.
              </button>
            ) : (
              <div className="space-y-2">
                {draft.items.map((it, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 items-center rounded-lg border border-border bg-surface p-2"
                  >
                    <Input
                      className="col-span-7"
                      placeholder="Descripción"
                      value={it.description}
                      onChange={(e) => updateItem(idx, "description", e.target.value)}
                    />
                    <Input
                      className="col-span-2 text-right"
                      type="text"
                      inputMode="decimal"
                      value={it.quantity === 0 ? "" : String(it.quantity)}
                      onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                    />
                    <MoneyInput
                      className="col-span-2 text-right"
                      value={Number(it.unit_price) || 0}
                      onValueChange={(n) => updateItem(idx, "unit_price", String(n))}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="col-span-1"
                      onClick={() => removeItem(idx)}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center justify-end pt-1">
                  <span className="text-xs text-muted-foreground mr-2">Subtotal estimado</span>
                  <span className="font-display font-semibold text-lg tabular-nums">
                    {formatMoney(subtotal)}
                  </span>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Order details */}
          <SectionCard
            icon={<FileText className="h-4 w-4" />}
            title="Detalles del pedido"
            subtitle="Notas internas y fechas clave."
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <FieldBlock label="Observaciones" className="sm:col-span-2">
                <Textarea
                  rows={3}
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  placeholder="Notas, instrucciones, condiciones especiales…"
                />
              </FieldBlock>
              <FieldBlock label="Urgencia">
                <Input
                  value={draft.urgency}
                  onChange={(e) => setDraft((d) => ({ ...d, urgency: e.target.value }))}
                  placeholder="Ej. Necesita antes del 15 de junio"
                />
              </FieldBlock>
              <FieldBlock label="Fecha estimada de entrega">
                <Input
                  type="date"
                  value={draft.estimated_delivery_date}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, estimated_delivery_date: e.target.value }))
                  }
                />
              </FieldBlock>
            </div>
          </SectionCard>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 px-6 py-4 border-t border-border bg-background/95 backdrop-blur flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            Se creará el cliente y el pedido inicial en estado activo.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="gap-2"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Creando…
                </>
              ) : (
                <>Crear cliente + pedido</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionCard({
  icon,
  title,
  subtitle,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="grid place-items-center h-9 w-9 rounded-lg bg-accent/10 text-accent">
            {icon}
          </div>
          <div>
            <p className="text-sm font-medium leading-tight">{title}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function FieldBlock({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-[11px] uppercase tracking-wider mb-1.5 block text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
