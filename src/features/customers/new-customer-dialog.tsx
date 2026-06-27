import { useEffect, useState } from "react";
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
  Building2,
  Receipt,
  CreditCard,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { parseWhatsAppOrder } from "@/lib/whatsapp.functions";
import { formatMoney } from "@/features/orders/order-items-editor";
import { MoneyInput } from "@/features/orders/money-input";
import { ImageUploader, type PendingImage } from "@/features/orders/image-uploader";
import { uploadOrderImage, uploadOrderImages } from "@/lib/image-upload";
import { DEPOSIT_ACCOUNTS } from "@/features/finance/deposit-accounts";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ---------- Catálogos ----------
const DOC_TYPES = [
  { value: "CC", label: "CC · Cédula de ciudadanía" },
  { value: "CE", label: "CE · Cédula de extranjería" },
  { value: "NIT", label: "NIT" },
  { value: "TI", label: "TI · Tarjeta de identidad" },
  { value: "PA", label: "PA · Pasaporte" },
  { value: "PEP", label: "PEP · Permiso especial" },
  { value: "RC", label: "RC · Registro civil" },
  { value: "NIUP", label: "NIUP" },
] as const;

const PAYMENT_METHODS = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "nequi", label: "Nequi" },
  { value: "daviplata", label: "Daviplata" },
  { value: "credito", label: "Crédito" },
  { value: "cheque", label: "Cheque" },
  { value: "otro", label: "Otro" },
] as const;

// ---------- Tipos ----------
type CustomerDraft = {
  display_name: string;
  company: string;
  person_type: "" | "natural" | "juridica";
  contact_type: "cliente" | "proveedor";
  doc_type: string;
  doc_number: string;
  phone: string;
  email: string;
  department: string;
  city: string;
  address: string;
  needs_summary: string;
  references: string;
};

type OrderDraft = {
  invoice_number: string;
  sale_date: string;
  estimated_delivery_date: string;
  payment_method: string;
  advance_amount: number;
  advance_deposit_account: string;
};

type Draft = {
  customer: CustomerDraft;
  order: OrderDraft;
  items: { description: string; quantity: number; unit_price: number }[];
  notes: string;
  urgency: string;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const EMPTY: Draft = {
  customer: {
    display_name: "",
    company: "",
    person_type: "",
    contact_type: "cliente",
    doc_type: "",
    doc_number: "",
    phone: "",
    email: "",
    department: "",
    city: "",
    address: "",
    needs_summary: "",
    references: "",
  },
  order: {
    invoice_number: "",
    sale_date: todayISO(),
    estimated_delivery_date: "",
    payment_method: "",
    advance_amount: 0,
    advance_deposit_account: "",
  },
  items: [],
  notes: "",
  urgency: "",
};

function buildCustomerNotes(c: CustomerDraft, urgency: string) {
  const parts: string[] = [];
  if (c.needs_summary) parts.push(`Necesidad: ${c.needs_summary}`);
  if (c.references) parts.push(`Referencias: ${c.references}`);
  if (urgency) parts.push(`Urgencia: ${urgency}`);
  return parts.join("\n");
}

function brandInvoicePrefix(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "INV";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

async function fetchNextInvoiceNumber(brandId: string, prefix: string): Promise<string> {
  const { data } = await supabase
    .from("orders")
    .select("invoice_number")
    .eq("brand_id", brandId)
    .ilike("invoice_number", `${prefix}-%`)
    .order("invoice_number", { ascending: false })
    .limit(50);
  let max = 0;
  for (const row of data ?? []) {
    const m = String(row.invoice_number ?? "").match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
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
  const [paymentProof, setPaymentProof] = useState<PendingImage[]>([]);
  const [itemImages, setItemImages] = useState<PendingImage[][]>([]);

  const reset = () => {
    setRawText("");
    setDraft({ ...EMPTY, order: { ...EMPTY.order, sale_date: todayISO() } });
    setAiOpen(true);
    paymentProof.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    itemImages.flat().forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPaymentProof([]);
    setItemImages([]);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };


  // Prefilled defaults: empresa = marca activa, nro factura = consecutivo por marca
  useEffect(() => {
    if (!open || !selectedBrand || !selectedBrandId) return;
    setDraft((d) => ({
      ...d,
      customer: {
        ...d.customer,
        company: d.customer.company || selectedBrand.name,
      },
    }));
    const prefix = brandInvoicePrefix(selectedBrand.name);
    fetchNextInvoiceNumber(selectedBrandId, prefix)
      .then((next) => {
        setDraft((d) =>
          d.order.invoice_number
            ? d
            : { ...d, order: { ...d.order, invoice_number: next } },
        );
      })
      .catch(() => {
        /* silencioso: el vendedor puede escribirlo manual */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedBrandId]);



  const parseMutation = useMutation({
    mutationFn: async () => parseFn({ data: { text: rawText } }),
    onSuccess: (data) => {
      if (!data.success) {
        toast.error(data.message);
        return;
      }
      const ext = data.order;
      setDraft((d) => ({
        customer: {
          display_name: ext.customer.display_name || d.customer.display_name,
          company: ext.customer.company || d.customer.company,
          person_type:
            (ext.customer.person_type as CustomerDraft["person_type"]) || d.customer.person_type,
          contact_type:
            (ext.customer.contact_type as CustomerDraft["contact_type"]) || d.customer.contact_type,
          doc_type: ext.customer.doc_type || d.customer.doc_type,
          doc_number: ext.customer.doc_number || d.customer.doc_number,
          phone: ext.customer.phone || d.customer.phone,
          email: ext.customer.email || d.customer.email,
          department: ext.customer.department || d.customer.department,
          city: ext.customer.city || d.customer.city,
          address: ext.customer.address || d.customer.address,
          needs_summary: ext.customer.needs_summary || d.customer.needs_summary,
          references: ext.customer.references || d.customer.references,
        },
        order: {
          invoice_number: ext.order.invoice_number || d.order.invoice_number,
          sale_date: ext.order.sale_date || d.order.sale_date,
          estimated_delivery_date:
            ext.order.estimated_delivery_date || d.order.estimated_delivery_date,
          payment_method: ext.order.payment_method || d.order.payment_method,
          advance_amount: ext.order.advance_amount || d.order.advance_amount,
          advance_deposit_account: d.order.advance_deposit_account,
        },
        items: ext.items.length > 0 ? ext.items : d.items,
        notes: ext.notes || d.notes,
        urgency: ext.urgency || d.urgency,
      }));
      setAiOpen(false);
      toast.success("Datos extraídos. Revisa antes de guardar.");
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo procesar el texto"),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBrandId) throw new Error("Selecciona una marca");
      const c = draft.customer;
      if (!c.display_name.trim()) throw new Error("El nombre / razón social es obligatorio");
      if (draft.items.length === 0)
        throw new Error("Agrega al menos un producto para crear el pedido");

      const _subtotal = draft.items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
      const _advance = draft.order.advance_amount || 0;
      if (!draft.order.payment_method) throw new Error("Selecciona la modalidad de pago");
      if (_subtotal <= 0) throw new Error("El subtotal de la venta debe ser mayor a cero");
      if (_advance < _subtotal * 0.5 - 0.01) {
        throw new Error(
          `El abono debe ser mínimo el 50% del total (${formatMoney(_subtotal * 0.5)}).`,
        );
      }
      if (!draft.order.advance_deposit_account)
        throw new Error("Indica a qué cuenta llegó el abono del 50%");


      const {
        data: { user },
      } = await supabase.auth.getUser();
      const userId = user?.id;

      // Estado inicial de la marca
      const { data: status } = await supabase
        .from("order_statuses")
        .select("id")
        .eq("brand_id", selectedBrandId)
        .eq("is_active", true)
        .order("sort_order")
        .limit(1)
        .maybeSingle();
      if (!status) throw new Error("No hay estados configurados para esta marca");

      const notesParts: string[] = [];
      if (c.needs_summary) notesParts.push(`Necesidad: ${c.needs_summary}`);
      if (c.references) notesParts.push(`Referencias: ${c.references}`);
      if (draft.urgency) notesParts.push(`Urgencia: ${draft.urgency}`);
      if (draft.notes) notesParts.push(draft.notes);
      const orderNotes = notesParts.join("\n");

      // Pedido con snapshot del cliente (sin tabla customers)
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          brand_id: selectedBrandId,
          status_id: status.id,
          notes: orderNotes || null,
          order_number: "",
          created_by: userId,
          seller_id: userId,
          source: rawText ? "whatsapp" : "manual",
          whatsapp_raw: rawText || null,
          invoice_number: draft.order.invoice_number.trim() || null,
          sale_date: draft.order.sale_date || null,
          estimated_delivery_date: draft.order.estimated_delivery_date || null,
          payment_method: draft.order.payment_method || null,
          advance_amount: draft.order.advance_amount || 0,
          advance_deposit_account: draft.order.advance_deposit_account || null,
          customer_name: c.display_name.trim(),
          customer_doc_type: c.doc_type || null,
          customer_doc_number: c.doc_number.trim() || null,
          customer_phone: c.phone.trim() || null,
          customer_email: c.email.trim() || null,
          customer_address: c.address.trim() || null,
          customer_city: c.city.trim() || null,
          customer_department: c.department.trim() || null,
          customer_company: c.company.trim() || null,
          customer_person_type: c.person_type || null,
          customer_contact_type: c.contact_type || null,
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
      const { data: insertedItems, error: itemsErr } = await supabase
        .from("order_items")
        .insert(itemsPayload)
        .select("id, sort_order");
      if (itemsErr) throw itemsErr;

      // Sube imágenes de cada producto y actualiza el registro
      if (insertedItems && itemImages.length > 0) {
        await Promise.all(
          insertedItems.map(async (row) => {
            const pending = itemImages[row.sort_order ?? 0];
            if (!pending || pending.length === 0) return;
            const urls = await uploadOrderImages(
              pending.map((p) => p.file),
              `items/${row.id}`,
            );
            await supabase
              .from("order_items")
              .update({ images: urls as never })
              .eq("id", row.id);
          }),
        );
      }

      // Sube comprobante de pago y actualiza el pedido
      if (paymentProof[0]) {
        const url = await uploadOrderImage(paymentProof[0].file, `payments/${order.id}`);
        await supabase
          .from("orders")
          .update({ payment_proof_url: url } as never)
          .eq("id", order.id);
      }

      return order;
    },

    onSuccess: (order) => {
      toast.success(`Pedido ${order.order_number} creado`);
      qc.invalidateQueries({ queryKey: ["orders"] });
      handleOpenChange(false);
      navigate({ to: "/erp/orders/$id", params: { id: order.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setC = <K extends keyof CustomerDraft>(field: K, value: CustomerDraft[K]) =>
    setDraft((d) => ({ ...d, customer: { ...d.customer, [field]: value } }));
  const setO = <K extends keyof OrderDraft>(field: K, value: OrderDraft[K]) =>
    setDraft((d) => ({ ...d, order: { ...d.order, [field]: value } }));

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

  const addItem = () => {
    setDraft((d) => ({
      ...d,
      items: [...d.items, { description: "", quantity: 1, unit_price: 0 }],
    }));
    setItemImages((arr) => [...arr, []]);
  };

  const removeItem = (idx: number) => {
    setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== idx) }));
    setItemImages((arr) => {
      const removed = arr[idx] ?? [];
      removed.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return arr.filter((_, i) => i !== idx);
    });
  };

  const setImagesForItem = (idx: number, next: PendingImage[]) =>
    setItemImages((arr) => {
      const copy = [...arr];
      while (copy.length <= idx) copy.push([]);
      copy[idx] = next;
      return copy;
    });


  const subtotal = draft.items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
  const saldo = Math.max(0, subtotal - (draft.order.advance_amount || 0));
  const minAdvance = subtotal * 0.5;
  const advanceOk = subtotal > 0 && (draft.order.advance_amount || 0) >= minAdvance - 0.01;
  const paymentMethodOk = !!draft.order.payment_method;
  const depositAccountOk = !!draft.order.advance_deposit_account;
  const paymentBlockOk = subtotal > 0 && advanceOk && paymentMethodOk && depositAccountOk;
  const isJuridica = draft.customer.person_type === "juridica";


  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0 gap-0 bg-background">
        {/* Hero */}
        <div className="relative px-6 pt-6 pb-5 border-b border-border bg-gradient-to-br from-accent/10 via-background to-background">
          <DialogHeader className="relative">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="grid place-items-center h-10 w-10 rounded-xl bg-accent text-accent-foreground shadow-sm">
                <User className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="font-display text-xl">Nueva venta</DialogTitle>
                <DialogDescription className="text-xs">
                  Registra la venta con los datos del cliente. Todo queda guardado en la venta.
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
          {/* IA */}
          <section
            className={cn(
              "rounded-2xl border transition-colors",
              aiOpen
                ? "border-accent/40 bg-gradient-to-br from-accent/[0.06] to-transparent"
                : "border-border bg-surface",
            )}
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
                  Pega la conversación y la IA llena el formulario por ti.
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
                <div className="flex items-center justify-between gap-2 flex-wrap">
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

          {/* Identificación */}
          <SectionCard
            icon={<User className="h-4 w-4" />}
            title="Identificación del contacto"
            subtitle="Tipo de persona, tipo de contacto y documento."
          >
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <FieldBlock label="Tipo de persona">
                  <SegmentedTwo
                    value={draft.customer.person_type}
                    onChange={(v) => setC("person_type", v as CustomerDraft["person_type"])}
                    options={[
                      { value: "natural", label: "Persona natural" },
                      { value: "juridica", label: "Persona jurídica" },
                    ]}
                  />
                </FieldBlock>
                <FieldBlock label="Tipo de contacto">
                  <SegmentedTwo
                    value={draft.customer.contact_type}
                    onChange={(v) => setC("contact_type", v as CustomerDraft["contact_type"])}
                    options={[
                      { value: "cliente", label: "Cliente" },
                      { value: "proveedor", label: "Proveedor" },
                    ]}
                  />
                </FieldBlock>
              </div>

              <div className="grid sm:grid-cols-12 gap-4">
                <FieldBlock label="Tipo de identificación" className="sm:col-span-5">
                  <Select
                    value={draft.customer.doc_type || undefined}
                    onValueChange={(v) => setC("doc_type", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar…" />
                    </SelectTrigger>
                    <SelectContent>
                      {DOC_TYPES.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldBlock>
                <FieldBlock label="Número de identificación" className="sm:col-span-7">
                  <Input
                    value={draft.customer.doc_number}
                    onChange={(e) => setC("doc_number", e.target.value)}
                    inputMode="numeric"
                    placeholder="Sólo dígitos"
                  />
                </FieldBlock>
              </div>
            </div>
          </SectionCard>

          {/* Datos del cliente */}
          <SectionCard
            icon={<Building2 className="h-4 w-4" />}
            title="Datos del cliente"
            subtitle="Nombre, contacto y ubicación."
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <FieldBlock label={isJuridica ? "Razón social *" : "Nombre del cliente *"}>
                <Input
                  value={draft.customer.display_name}
                  onChange={(e) => setC("display_name", e.target.value)}
                  placeholder={isJuridica ? "Ej. Muebles ACME S.A.S." : "Ej. Andrea Restrepo"}
                />
              </FieldBlock>
              <FieldBlock label="Empresa">
                <Input
                  value={draft.customer.company}
                  onChange={(e) => setC("company", e.target.value)}
                  placeholder="Empresa o lugar de trabajo (opcional)"
                />
              </FieldBlock>
              <FieldBlock label="Celular">
                <Input
                  value={draft.customer.phone}
                  onChange={(e) => setC("phone", e.target.value)}
                  inputMode="tel"
                  placeholder="3001234567"
                />
              </FieldBlock>
              <FieldBlock label="Correo">
                <Input
                  type="email"
                  value={draft.customer.email}
                  onChange={(e) => setC("email", e.target.value)}
                  placeholder="cliente@correo.com"
                />
              </FieldBlock>
              <FieldBlock label="Departamento">
                <Input
                  value={draft.customer.department}
                  onChange={(e) => setC("department", e.target.value)}
                  placeholder="Ej. Antioquia"
                />
              </FieldBlock>
              <FieldBlock label="Ciudad">
                <Input
                  value={draft.customer.city}
                  onChange={(e) => setC("city", e.target.value)}
                  placeholder="Ej. Medellín"
                />
              </FieldBlock>
              <FieldBlock label="Dirección" className="sm:col-span-2">
                <div className="relative">
                  <MapPin className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={draft.customer.address}
                    onChange={(e) => setC("address", e.target.value)}
                    placeholder="Calle, número, barrio…"
                  />
                </div>
              </FieldBlock>
            </div>

            <div className="mt-4 grid gap-3 rounded-xl border border-accent/30 bg-accent/[0.04] p-4">
              <FieldBlock label="¿Qué necesita el cliente?">
                <Textarea
                  rows={2}
                  value={draft.customer.needs_summary}
                  onChange={(e) => setC("needs_summary", e.target.value)}
                  placeholder="Ej. Cocina integral en L para apartamento, acabado mate."
                />
              </FieldBlock>
              <FieldBlock label="Referencias / medidas / materiales">
                <Textarea
                  rows={2}
                  value={draft.customer.references}
                  onChange={(e) => setC("references", e.target.value)}
                  placeholder="Medidas, colores, enlaces, fotos descritas…"
                />
              </FieldBlock>
              <p className="text-[11px] text-muted-foreground">
                Este resumen queda en la ficha del cliente para no volver a preguntarlo.
              </p>
            </div>
          </SectionCard>

          {/* Facturación */}
          <SectionCard
            icon={<Receipt className="h-4 w-4" />}
            title="Facturación y fechas"
            subtitle="Número de factura y fechas clave."
          >
            <div className="grid sm:grid-cols-3 gap-4">
              <FieldBlock label="Nro Factura">
                <Input
                  value={draft.order.invoice_number}
                  onChange={(e) => setO("invoice_number", e.target.value)}
                  placeholder="Ej. CD-1686"
                />
              </FieldBlock>
              <FieldBlock label="Fecha de venta">
                <Input
                  type="date"
                  value={draft.order.sale_date}
                  onChange={(e) => setO("sale_date", e.target.value)}
                />
              </FieldBlock>
              <FieldBlock label="Fecha de entrega">
                <Input
                  type="date"
                  value={draft.order.estimated_delivery_date}
                  onChange={(e) => setO("estimated_delivery_date", e.target.value)}
                />
              </FieldBlock>
            </div>
          </SectionCard>

          {/* Productos */}
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
                    className="rounded-lg border border-border bg-surface p-3 space-y-3"
                  >
                    {(() => {
                      const raw = it.description ?? "";
                      const nlIdx = raw.indexOf("\n");
                      const title = nlIdx === -1 ? raw : raw.slice(0, nlIdx);
                      const body = nlIdx === -1 ? "" : raw.slice(nlIdx + 1).replace(/^\n+/, "");
                      const join = (t: string, b: string) => {
                        // No trim aquí: si recortamos, el usuario no puede escribir
                        // un espacio al final del título (se borra en cada tecla).
                        if (!t && !b) return "";
                        if (!b) return t;
                        if (!t) return `\n\n${b}`;
                        return `${t}\n\n${b}`;
                      };
                      return (
                        <div className="grid grid-cols-12 gap-2 items-start">
                          <div className="col-span-12 sm:col-span-7 space-y-2">
                            <Input
                              placeholder="Título del producto (ej. Sofá modular 3 puestos)"
                              value={title}
                              onChange={(e) =>
                                updateItem(idx, "description", join(e.target.value, body))
                              }
                            />
                            <Textarea
                              placeholder="Descripción detallada (medidas, telas, acabados, etc.)"
                              value={body}
                              onChange={(e) =>
                                updateItem(idx, "description", join(title, e.target.value))
                              }
                              className="min-h-[80px] text-sm"
                            />
                          </div>
                          <Input
                            className="col-span-3 sm:col-span-2 text-right"
                            type="text"
                            inputMode="decimal"
                            value={it.quantity === 0 ? "" : String(it.quantity)}
                            onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                          />
                          <MoneyInput
                            className="col-span-7 sm:col-span-2 text-right"
                            value={Number(it.unit_price) || 0}
                            onValueChange={(n) => updateItem(idx, "unit_price", String(n))}
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="col-span-2 sm:col-span-1"
                            onClick={() => removeItem(idx)}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      );
                    })()}
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                        Imágenes de referencia
                      </p>
                      <ImageUploader
                        multiple
                        pending={itemImages[idx] ?? []}
                        onChangePending={(next) => setImagesForItem(idx, next)}
                        label="Agregar referencias"
                        hint="Se comprimen automáticamente antes de subir."
                      />
                    </div>
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

          {/* Pago */}
          <SectionCard
            icon={<CreditCard className="h-4 w-4" />}
            title="Pago"
            subtitle="Modalidad y abono inicial (mínimo 50% del total)."
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <FieldBlock label="Modalidad de pago *">
                <Select
                  value={draft.order.payment_method || undefined}
                  onValueChange={(v) => setO("payment_method", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>
              <FieldBlock label={`Abono * (mín. ${subtotal > 0 ? formatMoney(minAdvance) : "50% del total"})`}>
                <MoneyInput
                  value={draft.order.advance_amount}
                  onValueChange={(n) => setO("advance_amount", n)}
                />
            </FieldBlock>
            </div>
            <div className="mt-3">
              <FieldBlock label="Cuenta destino del abono *">
                <Select
                  value={draft.order.advance_deposit_account || undefined}
                  onValueChange={(v) => setO("advance_deposit_account", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="¿A qué cuenta llegó el abono?" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPOSIT_ACCOUNTS.map((a) => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>
            </div>
            {subtotal > 0 && !advanceOk && (
              <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
                El abono debe ser mínimo el 50% del total ({formatMoney(minAdvance)}). Faltan{" "}
                <span className="font-medium">{formatMoney(Math.max(0, minAdvance - (draft.order.advance_amount || 0)))}</span>.
              </div>
            )}

            {subtotal > 0 && (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-3 gap-2 text-xs rounded-lg border border-border bg-surface p-3">
                  <Stat label="Total" value={formatMoney(subtotal)} />
                  <Stat label="Abono" value={formatMoney(draft.order.advance_amount || 0)} accent />
                  <Stat label="Saldo" value={formatMoney(saldo)} strong />
                </div>
                {(() => {
                  const abono = draft.order.advance_amount || 0;
                  const pctAbono = subtotal > 0 ? Math.min(100, (abono / subtotal) * 100) : 0;
                  const pctSaldo = 100 - pctAbono;
                  return (
                    <div className="rounded-lg border border-accent/30 bg-accent/[0.04] p-3 space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          Abonado <span className="text-accent font-medium">{pctAbono.toFixed(1)}%</span>
                        </span>
                        <span>
                          Pendiente <span className="text-foreground font-medium">{pctSaldo.toFixed(1)}%</span>
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-border overflow-hidden flex">
                        <div
                          className="h-full bg-accent transition-all"
                          style={{ width: `${pctAbono}%` }}
                        />
                        <div
                          className="h-full bg-foreground/70 transition-all"
                          style={{ width: `${pctSaldo}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Queda debiendo{" "}
                        <span className="font-medium text-foreground">{formatMoney(saldo)}</span>
                        {" "}({pctSaldo.toFixed(1)}% del total).
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Comprobante de pago
              </p>
              <ImageUploader
                pending={paymentProof}
                onChangePending={setPaymentProof}
                label="Subir comprobante"
                hint="Foto del recibo, transferencia o consignación. Se comprime antes de subir."
              />
            </div>
          </SectionCard>


          {/* Notas */}
          <SectionCard
            icon={<FileText className="h-4 w-4" />}
            title="Observaciones"
            subtitle="Notas internas y urgencia."
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <FieldBlock label="Notas" className="sm:col-span-2">
                <Textarea
                  rows={3}
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  placeholder="Instrucciones, condiciones especiales…"
                />
              </FieldBlock>
              <FieldBlock label="Urgencia" className="sm:col-span-2">
                <Input
                  value={draft.urgency}
                  onChange={(e) => setDraft((d) => ({ ...d, urgency: e.target.value }))}
                  placeholder="Ej. Necesita antes del 15 de junio"
                />
              </FieldBlock>
            </div>
          </SectionCard>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 px-6 py-4 border-t border-border bg-background/95 backdrop-blur flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[11px] text-muted-foreground">
            Se creará el cliente y el pedido inicial en estado activo.
          </p>
          <div className="flex gap-2 ml-auto">
            <Button variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !paymentBlockOk}
              className="gap-2"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Creando…
                </>
              ) : (
                <>Crear cliente + venta</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Subcomponentes ----------
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
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
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

function SegmentedTwo({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "h-10 px-3 rounded-md border text-xs font-medium transition-colors",
              active
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-surface hover:border-accent/40 text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  strong,
}: {
  label: string;
  value: string;
  accent?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="text-center">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tabular-nums mt-0.5",
          strong ? "font-display font-semibold text-base" : "font-medium",
          accent && "text-accent",
        )}
      >
        {value}
      </p>
    </div>
  );
}
