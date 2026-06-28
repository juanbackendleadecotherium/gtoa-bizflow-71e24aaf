import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Building2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/erp/settings/brand-billing")({
  component: BrandBillingPage,
});

type BrandRow = {
  id: string; name: string; legal_name: string | null; tax_id: string | null;
  address: string | null; city: string | null; phone: string | null;
  email: string | null; website: string | null; invoice_footer_note: string | null;
};

function BrandBillingPage() {
  const { isAdmin, selectedBrandId, selectedBrand } = useBrand();
  const qc = useQueryClient();

  const brandQuery = useQuery({
    queryKey: ["brand-billing", selectedBrandId],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, name, legal_name, tax_id, address, city, phone, email, website, invoice_footer_note")
        .eq("id", selectedBrandId!)
        .maybeSingle();
      if (error) throw error;
      return data as BrandRow | null;
    },
  });

  const [form, setForm] = useState<Partial<BrandRow>>({});
  useEffect(() => {
    if (brandQuery.data) setForm(brandQuery.data);
  }, [brandQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("brands").update({
        legal_name: form.legal_name || null,
        tax_id: form.tax_id || null,
        address: form.address || null,
        city: form.city || null,
        phone: form.phone || null,
        email: form.email || null,
        website: form.website || null,
        invoice_footer_note: form.invoice_footer_note || null,
      }).eq("id", selectedBrandId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Datos fiscales actualizados");
      qc.invalidateQueries({ queryKey: ["brand-billing", selectedBrandId] });
      qc.invalidateQueries({ queryKey: ["brands"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return <p className="text-sm text-muted-foreground">Solo administradores pueden editar los datos fiscales.</p>;
  }

  if (brandQuery.isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  const set = (k: keyof BrandRow) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-1">Configuración</p>
        <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
          <Building2 className="h-6 w-6" /> Datos fiscales · {selectedBrand?.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Estos datos aparecen en el encabezado de cada cuenta de cobro emitida por esta marca.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5 space-y-4 max-w-2xl">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Razón social</Label>
            <Input value={form.legal_name ?? ""} onChange={set("legal_name")} placeholder="Ej. Casa Diseño S.A.S." />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">NIT</Label>
            <Input value={form.tax_id ?? ""} onChange={set("tax_id")} placeholder="900.123.456-7" />
          </div>
        </div>

        <div>
          <Label className="text-xs mb-1.5 block text-muted-foreground">Dirección</Label>
          <Input value={form.address ?? ""} onChange={set("address")} placeholder="Calle 10 #20-30" />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Ciudad</Label>
            <Input value={form.city ?? ""} onChange={set("city")} placeholder="Medellín" />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Teléfono</Label>
            <Input value={form.phone ?? ""} onChange={set("phone")} placeholder="+57 300 123 4567" />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Correo</Label>
            <Input type="email" value={form.email ?? ""} onChange={set("email")} placeholder="ventas@casadiseno.com" />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Sitio web</Label>
            <Input value={form.website ?? ""} onChange={set("website")} placeholder="www.casadiseno.com" />
          </div>
        </div>

        <div>
          <Label className="text-xs mb-1.5 block text-muted-foreground">Nota al pie de cuenta de cobro (opcional)</Label>
          <Textarea rows={2} value={form.invoice_footer_note ?? ""} onChange={set("invoice_footer_note")} placeholder="Ej. Gracias por su compra. Servicio postventa: …" />
        </div>

        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </>
  );
}
