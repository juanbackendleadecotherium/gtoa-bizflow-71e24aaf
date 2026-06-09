import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Factory, Loader2, ExternalLink, Plus, RefreshCw, Package } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
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

type ItemRow = {
  id: string;
  description: string;
  quantity: number;
  images: string[];
  sort_order: number;
  production_order_id: string | null;
};

async function urlToDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const blob = await res.blob();

    if (!/^image\/(png|jpe?g)$/i.test(blob.type)) {
      const objectUrl = URL.createObjectURL(blob);
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new window.Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = objectUrl;
        });
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL("image/png");
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }

    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function buildPlanData(
  orderId: string, brandId: string, productionCode: string, selectedItemIds: string[],
): Promise<PlanimetryDocumentData> {
  const [orderRes, brandRes, userRes] = await Promise.all([
    supabase.from("orders").select(`
      order_number, invoice_number, sale_date, estimated_delivery_date, notes,
      customer_name, customer_phone, customer_city, created_by,
      items:order_items(id, description, quantity, images, sort_order)
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

  const selectedSet = new Set(selectedItemIds);
  const filteredItems = (order.items ?? [])
    .filter((it: any) => selectedSet.has(it.id))
    .slice()
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  // Pre-fetch all images as data URIs so @react-pdf/renderer never fails
  // on network/CORS issues for the first image of the document.
  const items = await Promise.all(
    filteredItems.map(async (it: any) => {
      const rawImages: string[] = Array.isArray(it.images) ? it.images : [];
      const resolved = await Promise.all(rawImages.map(async (u) => (await urlToDataUri(u)) ?? u));
      return {
        description: it.description ?? "",
        quantity: Number(it.quantity ?? 1),
        images: resolved.filter((u): u is string => !!u),
      };
    }),
  );

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

export async function generatePlanimetryForOrder(opts: {
  productionOrderId: string;
  productionCode: string;
  orderId: string;
  brandId: string;
  selectedItemIds: string[];
  noteOverride?: string;
}) {
  const planData = await buildPlanData(opts.orderId, opts.brandId, opts.productionCode, opts.selectedItemIds);

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
      ? `Generada automáticamente desde la venta (${opts.selectedItemIds.length} producto${opts.selectedItemIds.length === 1 ? "" : "s"})`
      : `Regenerada tras edición de la venta (v${nextVersion}, ${opts.selectedItemIds.length} producto${opts.selectedItemIds.length === 1 ? "" : "s"})`),
  });
  if (insErr) throw insErr;

  // Link items to this production order
  const { error: linkErr } = await supabase
    .from("order_items")
    .update({ production_order_id: opts.productionOrderId })
    .in("id", opts.selectedItemIds);
  if (linkErr) throw linkErr;

  return nextVersion;
}

export function ProductionSection({ orderId, brandId }: { orderId: string; brandId: string }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<string>("new");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

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

  const items = useQuery({
    queryKey: ["order-items-for-production", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, description, quantity, images, sort_order, production_order_id")
        .eq("order_id", orderId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((it: any) => ({
        ...it,
        images: Array.isArray(it.images) ? it.images : [],
      })) as ItemRow[];
    },
  });

  const codeById = useMemo(() => {
    const m = new Map<string, string>();
    (list.data ?? []).forEach((p) => m.set(p.id, p.code));
    return m;
  }, [list.data]);

  const ownerById = useMemo(() => {
    const m = new Map<string, ProdRow>();
    (list.data ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [list.data]);

  // An item is "locked" for the current destination when it already belongs to
  // a non-rejected production order that's different from the chosen target.
  const getItemLock = (it: ItemRow): { disabled: boolean; reason?: string } => {
    if (!it.production_order_id) return { disabled: false };
    const owner = ownerById.get(it.production_order_id);
    if (!owner || owner.status === "rechazada") return { disabled: false };
    if (selectedTarget === owner.id) return { disabled: false };
    if (selectedTarget === "new") return { disabled: true, reason: `Ya en ${owner.code}` };
    return { disabled: true, reason: `Pertenece a ${owner.code}` };
  };

  // Re-seed selection when dialog opens or destination changes.
  useEffect(() => {
    if (!dialogOpen || !items.data) return;
    if (selectedTarget === "new") {
      const unsent = items.data
        .filter((i) => !getItemLock(i).disabled && !i.production_order_id)
        .map((i) => i.id);
      setSelectedItems(new Set(unsent));
    } else {
      const owned = items.data
        .filter((i) => i.production_order_id === selectedTarget)
        .map((i) => i.id);
      setSelectedItems(new Set(owned));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, items.data, selectedTarget, list.data]);

  const createNew = useMutation({
    mutationFn: async (selectedItemIds: string[]) => {
      const { data: created, error } = await supabase.from("production_orders").insert({
        order_id: orderId, brand_id: brandId, code: "",
      } as any).select("id, code").single();
      if (error) throw error;

      try {
        await generatePlanimetryForOrder({
          productionOrderId: created.id,
          productionCode: created.code,
          orderId, brandId, selectedItemIds,
        });
      } catch (planErr: any) {
        console.error("Error generando planimetría automática", planErr);
        toast.warning("Orden creada, pero no se pudo generar la planimetría automática");
      }
      return { code: created.code as string, count: selectedItemIds.length };
    },
    onSuccess: ({ code, count }) => {
      toast.success(`Nueva orden ${code} creada con ${count} producto${count === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["production-by-order", orderId] });
      qc.invalidateQueries({ queryKey: ["order-items-for-production", orderId] });
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      setDialogOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const regenerate = useMutation({
    mutationFn: async (args: { target: ProdRow; selectedItemIds: string[] }) => {
      const v = await generatePlanimetryForOrder({
        productionOrderId: args.target.id,
        productionCode: args.target.code,
        orderId, brandId,
        selectedItemIds: args.selectedItemIds,
      });
      return { code: args.target.code, v, count: args.selectedItemIds.length };
    },
    onSuccess: ({ code, v, count }) => {
      toast.success(`Planimetría v${v} generada con ${count} producto${count === 1 ? "" : "s"} en ${code}`);
      qc.invalidateQueries({ queryKey: ["production-by-order", orderId] });
      qc.invalidateQueries({ queryKey: ["order-items-for-production", orderId] });
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      qc.invalidateQueries({ queryKey: ["production-planimetries"] });
      setDialogOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const busy = createNew.isPending || regenerate.isPending;
  const existing = list.data ?? [];
  const allItems = items.data ?? [];
  const freeItemsCount = allItems.filter((i) => !getItemLock(i).disabled).length;

  const handleSendClick = () => {
    // Default to "new" — locked items stay disabled, unsent items get pre-checked.
    setSelectedTarget("new");
    setDialogOpen(true);
  };

  const handleConfirm = () => {
    const ids = Array.from(selectedItems);
    if (ids.length === 0) return;
    if (selectedTarget === "new") {
      createNew.mutate(ids);
    } else {
      const target = existing.find((p) => p.id === selectedTarget);
      if (target) regenerate.mutate({ target, selectedItemIds: ids });
    }
  };

  const toggleItem = (id: string) => {
    const it = allItems.find((x) => x.id === id);
    if (it && getItemLock(it).disabled) return;
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () =>
    setSelectedItems(new Set(allItems.filter((i) => !getItemLock(i).disabled).map((i) => i.id)));
  const selectNone = () => setSelectedItems(new Set());
  const selectUnsent = () =>
    setSelectedItems(new Set(allItems.filter((i) => !i.production_order_id).map((i) => i.id)));

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Factory className="h-4 w-4" /> Producción
        </h2>
        <Button size="sm" variant="outline" onClick={handleSendClick}
          disabled={busy || items.isLoading} className="gap-1">
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
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enviar a producción</DialogTitle>
            <DialogDescription>
              Elige qué productos enviar y a dónde. Puedes mandar solo algunos y dejar el resto para después.
            </DialogDescription>
          </DialogHeader>

          {/* Destination */}
          {existing.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Destino</p>
              <RadioGroup value={selectedTarget} onValueChange={setSelectedTarget} className="space-y-2">
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
                        Actualizar esta orden con nueva versión de planimetría
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
            </div>
          )}

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Package className="h-3.5 w-3.5" /> Productos a incluir
                <span className="text-muted-foreground/80 normal-case tracking-normal">
                  ({selectedItems.size} de {allItems.length})
                </span>
              </p>
              <div className="flex gap-2 text-[11px]">
                <button type="button" onClick={selectAll} className="text-primary hover:underline">Todos</button>
                <span className="text-muted-foreground">·</span>
                <button type="button" onClick={selectUnsent} className="text-primary hover:underline">Solo no enviados</button>
                <span className="text-muted-foreground">·</span>
                <button type="button" onClick={selectNone} className="text-primary hover:underline">Ninguno</button>
              </div>
            </div>

            {items.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : allItems.length === 0 ? (
              <p className="text-xs text-muted-foreground">Esta venta no tiene productos.</p>
            ) : (
              <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {allItems.map((it) => {
                  const checked = selectedItems.has(it.id);
                  const sentCode = it.production_order_id ? codeById.get(it.production_order_id) : null;
                  const lock = getItemLock(it);
                  return (
                    <li key={it.id}>
                      <Label htmlFor={`item-${it.id}`}
                        title={lock.disabled ? lock.reason : undefined}
                        className={`flex items-center gap-3 rounded-lg border border-border p-2.5 transition-colors overflow-hidden ${
                          lock.disabled
                            ? "opacity-60 cursor-not-allowed bg-muted/30"
                            : "cursor-pointer hover:border-primary/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                        }`}>
                        <Checkbox
                          id={`item-${it.id}`}
                          checked={checked}
                          disabled={lock.disabled}
                          onCheckedChange={() => toggleItem(it.id)}
                          className="shrink-0"
                        />
                        {it.images[0] ? (
                          <img src={it.images[0]} alt="" className="h-10 w-10 rounded object-cover border border-border shrink-0" />
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted shrink-0 grid place-content-center">
                            <Package className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate" title={it.description || ""}>
                            {(() => {
                              const words = (it.description || "(sin descripción)").trim().split(/\s+/);
                              const short = words.slice(0, 3).join(" ");
                              return words.length > 3 ? `${short}…` : short;
                            })()}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-[11px] text-muted-foreground shrink-0">Cant: {it.quantity}</span>
                            {lock.disabled ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium">
                                {lock.reason}
                              </span>
                            ) : sentCode ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono truncate">
                                {sentCode}
                              </span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium shrink-0">
                                Nuevo
                              </span>
                            )}
                          </div>
                        </div>
                      </Label>
                    </li>
                  );
                })}
              </ul>
            )}
            {selectedTarget === "new" && freeItemsCount === 0 && allItems.length > 0 && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                Todos los productos ya están en una orden de producción activa. Para crear otra orden, primero libera alguno rechazando la orden actual.
              </p>
            )}
          </div>


          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={busy || selectedItems.size === 0} className="gap-1">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar ({selectedItems.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
