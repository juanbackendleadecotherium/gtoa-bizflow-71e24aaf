import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Factory, Loader2, ExternalLink, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ProductionStatusBadge } from "./status-badge";
import type { PlanimetryDocumentData } from "./planimetry-document";

export function ProductionSection({ orderId, brandId }: { orderId: string; brandId: string }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ["production-by-order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_orders")
        .select("id, code, status, workshop, assigned_to_label, due_date, created_at")
        .eq("order_id", orderId).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      // 1. Insert production order
      const { data: created, error } = await supabase.from("production_orders").insert({
        order_id: orderId, brand_id: brandId, code: "",
      } as any).select("id, code").single();
      if (error) throw error;

      // 2. Fetch order + items + brand + user for the planimetry
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

      // Seller name: prefer order's creator profile, fall back to current user
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

      const planData: PlanimetryDocumentData = {
        production_code: created.code,
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

      // 3. Render PDF and upload
      try {
        const [{ pdf }, { PlanimetryDocument }] = await Promise.all([
          import("@react-pdf/renderer"),
          import("./planimetry-document"),
        ]);
        const blob = await pdf(<PlanimetryDocument data={planData} />).toBlob();
        const safeName = `Planimetria-${created.code}.pdf`;
        const path = `${brandId}/${created.id}/${Date.now()}-${safeName}`;

        const { error: upErr } = await supabase.storage
          .from("production-planimetries")
          .upload(path, blob, { contentType: "application/pdf", upsert: false });
        if (upErr) throw upErr;

        const { data: signed } = await supabase.storage
          .from("production-planimetries").createSignedUrl(path, 60 * 60 * 24 * 7);

        const { error: insErr } = await supabase.from("production_planimetries").insert({
          production_order_id: created.id,
          brand_id: brandId,
          file_url: signed?.signedUrl ?? "",
          file_path: path,
          file_name: safeName,
          file_size: blob.size,
          mime_type: "application/pdf",
          version: 1,
          notes: "Generada automáticamente desde la venta",
        });
        if (insErr) throw insErr;
      } catch (planErr: any) {
        // Don't roll back the production order if PDF fails — just warn
        console.error("Error generando planimetría automática", planErr);
        toast.warning("Orden creada, pero no se pudo generar la planimetría automática");
      }

      return created.id as string;
    },
    onSuccess: () => {
      toast.success("Orden de producción creada con planimetría inicial");
      qc.invalidateQueries({ queryKey: ["production-by-order", orderId] });
      qc.invalidateQueries({ queryKey: ["production-orders"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
    onSettled: () => setCreating(false),
  });

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Factory className="h-4 w-4" /> Producción
        </h2>
        <Button size="sm" variant="outline" onClick={() => { setCreating(true); create.mutate(); }}
          disabled={creating || create.isPending} className="gap-1">
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Enviar a producción
        </Button>
      </div>

      {list.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (list.data ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">Esta venta aún no tiene órdenes de producción.</p>
      ) : (
        <ul className="space-y-2">
          {(list.data ?? []).map((p: any) => (
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
    </section>
  );
}
