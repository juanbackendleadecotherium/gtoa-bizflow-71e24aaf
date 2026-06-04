import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Factory, Loader2, ExternalLink, Plus, RefreshCw } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ProductionStatusBadge } from "./status-badge";
import type { PlanimetryDocumentData } from "./planimetry-document";

type ProdRow = {
  id: string; code: string; status: string;
  workshop: string | null; assigned_to_label: string | null;
  due_date: string | null; created_at: string;
};

async function buildPlanData(orderId: string, brandId: string, productionCode: string): Promise<PlanimetryDocumentData> {
  const [orderRes, brandRes, userRes] = await Promise.all([
    supabase.from("orders").select(`
      order_number, invoice_number, sale_date, estimated_delivery_date, notes,
      customer_name, customer_phone, customer_city, created_by,
      items:order_items(description, quantity, images, sort_order)
    `).eq("id", orderId).maybeSingle(),
    supabase.from("brands").select("name, slug, legal_name, logo_url, primary_color").eq("id", brandId).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  if (orderRes.error) throw orderRes.error;
  if (brandRes.error) throw brandRes.error;
  const order = orderRes.data;
  const brand = brandRes.data;
  if (!order || !brand) throw new Error("No se pudo cargar la información para la planimetría");

  let sellerName: string | null = userRes.data.user?.email ?? null;
  if (order.created_by) {
    const { data: prof } = await supabase
      .from("profiles").select("display_name, email").eq("user_id", order.created_by).maybeSingle();
    if (prof) sellerName = prof.display_name || prof.email || sellerName;
  }

  const items = (order.items ?? [])
    .slice()
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((it: any) => ({
      description: it.description ?? "",
      quantity: Number(it.quantity ?? 1),
      images: Array.isArray(it.images) ? (it.images as string[]) : [],
    }));

  return {
    production_code: productionCode,
    invoice_number: order.invoice_number,
    order_number: order.order_number,
    sale_date: order.sale_date,
    estimated_delivery_date: order.estimated_delivery_date,
    seller_name: sellerName,
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
    customer_city: order.customer_city,
    notes: order.notes,
    brand: {
      name: brand.name,
      slug: (brand as any).slug ?? null,
      legal_name: brand.legal_name,
      logo_url: brand.logo_url,
      primary_color: brand.primary_color,
    },
    items,
  };
}

async function generatePlanimetryForOrder(opts: {
  productionOrderId: string;
  productionCode: string;
  orderId: string;
  brandId: string;
  noteOverride?: string;
}) {
  const planData = await buildPlanData(opts.orderId, opts.brandId, opts.productionCode);

  // Calculate next version
  const { data: existing } = await supabase
    .from("production_planimetries")
    .select("version")
    .eq("production_order_id", opts.productionOrderId)
    .order("version", { ascending: false })
    .limit(1);
  const nextVersion = (existing?.[0]?.version ?? 0) + 1;

  const [{ pdf }, { PlanimetryDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./planimetry-document"),
  ]);
  const blob = await pdf(<PlanimetryDocument data={planData} />).toBlob();
  const safeName = `Planimetria-${opts.productionCode}-v${nextVersion}.pdf`;
  const path = `${opts.brandId}/${opts.productionOrderId}/${Date.now()}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from("production-planimetries")
    .upload(path, blob, { contentType: "application/pdf", upsert: false });
  if (upErr) throw upErr;

  const { data: signed } = await supabase.storage
    .from("production-planimetries").createSignedUrl(path, 60 * 60 * 24 * 7);

  const { error: insErr } = await supabase.from("production_planimetries").insert({
    production_order_id: opts.productionOrderId,
    brand_id: opts.brandId,
    file_url: signed?.signedUrl ?? "",
    file_path: path,
    file_name: safeName,
    file_size: blob.size,
    mime_type: "application/pdf",
    version: nextVersion,
    notes: opts.noteOverride ?? (nextVersion === 1
      ? "Generada automáticamente desde la venta"
      : `Regenerada tras edición de la venta (v${nextVersion})`),
  });
  if (insErr) throw insErr;

  return nextVersion;
}

export function ProductionSection({ orderId, brandId }: { orderId: string; brandId: string }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<string>("new");

  const list = useQuery({
    queryKey: ["production-by-order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_orders")
        .select("id, code, status, workshop, assigned_to_label, due_date, created_at")
        .eq("order_id", orderId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProdRow[];
    },
  });

  const createNew = useMutation({
    mutationFn: async () => {
      const { data: created, error } = await supabase.from("production_orders").insert({
        order_id: orderId, brand_id: brandId, code: "",
      } as any).select("id, code").single();
      if (error) throw error;

      try {
        await generatePlanimetryForOrder({
          productionOrderId: created.id,
          productionCode: created.code,
          orderId, brandId,
        });
      } catch (planErr: any) {
        console.error("Error generando planimetría automática", planErr);
        toast.warning("Orden creada, pero no se pudo generar la planimetría automática");
      }
      return created.code as string;
    },
    onSuccess: (code) => {
      toast.success(`Nueva orden ${code} creada con planimetría v1`);
      qc.invalidateQueries({ queryKey: ["production-by-order", orderId] });
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      setDialogOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const regenerate = useMutation({
    mutationFn: async (target: ProdRow) => {
      const v = await generatePlanimetryForOrder({
        productionOrderId: target.id,
        productionCode: target.code,
        orderId, brandId,
      });
      return { code: target.code, v };
    },
    onSuccess: ({ code, v }) => {
      toast.success(`Planimetría v${v} generada para ${code}`);
      qc.invalidateQueries({ queryKey: ["production-by-order", orderId] });
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      qc.invalidateQueries({ queryKey: ["production-planimetries"] });
      setDialogOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const busy = createNew.isPending || regenerate.isPending;
  const existing = list.data ?? [];

  const handleSendClick = () => {
    if (existing.length === 0) {
      // No prior order → create directly
      createNew.mutate();
      return;
    }
    // Default selection: most recent active (non-rejected) order, else "new"
    const firstActive = existing.find((p) => p.status !== "rechazada" && p.status !== "listo");
    setSelectedTarget(firstActive?.id ?? existing[0].id);
    setDialogOpen(true);
  };

  const handleConfirm = () => {
    if (selectedTarget === "new") {
      createNew.mutate();
    } else {
      const target = existing.find((p) => p.id === selectedTarget);
      if (target) regenerate.mutate(target);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Factory className="h-4 w-4" /> Producción
        </h2>
        <Button size="sm" variant="outline" onClick={handleSendClick}
          disabled={busy} className="gap-1">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Enviar a producción
        </Button>
      </div>

      {list.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : existing.length === 0 ? (
        <p className="text-xs text-muted-foreground">Esta venta aún no tiene órdenes de producción.</p>
      ) : (
        <ul className="space-y-2">
          {existing.map((p) => (
            <li key={p.id}>
              <Link to="/erp/production/$id" params={{ id: p.id }}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background p-3 hover:border-primary/50 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-mono text-sm font-medium">{p.code}</p>
                    <ProductionStatusBadge status={p.status} />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {p.workshop && <>{p.workshop} · </>}
                    {p.assigned_to_label && <>{p.assigned_to_label} · </>}
                    {p.due_date && <>Entrega {new Date(p.due_date).toLocaleDateString("es-CO")}</>}
                  </p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => !busy && setDialogOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar a producción</DialogTitle>
            <DialogDescription>
              Esta venta ya tiene órdenes de producción. ¿Quieres regenerar la planimetría
              en una orden existente (incluyendo los nuevos productos) o crear una orden nueva?
            </DialogDescription>
          </DialogHeader>

          <RadioGroup value={selectedTarget} onValueChange={setSelectedTarget} className="space-y-2 my-2">
            {existing.map((p) => (
              <Label key={p.id} htmlFor={`target-${p.id}`}
                className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:border-primary/50 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <RadioGroupItem value={p.id} id={`target-${p.id}`} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono text-sm font-medium">{p.code}</span>
                    <ProductionStatusBadge status={p.status} />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Actualizar esta orden con una nueva versión de planimetría
                    {p.workshop ? ` · ${p.workshop}` : ""}
                  </p>
                </div>
              </Label>
            ))}
            <Label htmlFor="target-new"
              className="flex items-start gap-3 rounded-lg border border-dashed border-border p-3 cursor-pointer hover:border-primary/50 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <RadioGroupItem value="new" id="target-new" className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">Crear orden nueva</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Útil si esta parte de la venta va a un taller distinto.
                </p>
              </div>
            </Label>
          </RadioGroup>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={busy} className="gap-1">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
