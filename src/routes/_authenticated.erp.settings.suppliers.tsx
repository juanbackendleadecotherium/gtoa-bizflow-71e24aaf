import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Plus, Trash2, Pencil, Save, X, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/erp/settings/suppliers")({
  head: () => ({ meta: [{ title: "Proveedores — Grupo Getova" }] }),
  component: SuppliersPage,
});

type Supplier = {
  id: string; brand_id: string; name: string; category: string | null;
  contact_name: string | null; phone: string | null; email: string | null;
  notes: string | null; is_active: boolean;
  requires_advance_payment?: boolean;
  advance_payment_pct?: number;
};

function SuppliersPage() {
  const { selectedBrandId, isAdmin } = useBrand();
  const qc = useQueryClient();

  const settings = useQuery({
    queryKey: ["bps", selectedBrandId],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_production_settings").select("min_margin_pct")
        .eq("brand_id", selectedBrandId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [minPct, setMinPct] = useState<string>("");
  if (settings.data && minPct === "") setMinPct(String(settings.data.min_margin_pct));

  const saveSettings = useMutation({
    mutationFn: async () => {
      const value = Number(minPct);
      if (!isFinite(value) || value < 0 || value > 100) throw new Error("Margen 0-100");
      const { error } = await supabase.from("brand_production_settings")
        .upsert({ brand_id: selectedBrandId!, min_margin_pct: value }, { onConflict: "brand_id" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Configuración guardada"); qc.invalidateQueries({ queryKey: ["bps"] }); },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const list = useQuery({
    queryKey: ["suppliers", selectedBrandId],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers").select("*").eq("brand_id", selectedBrandId!).order("name");
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
  });

  const [editing, setEditing] = useState<Partial<Supplier> | null>(null);

  const save = useMutation({
    mutationFn: async (s: Partial<Supplier>) => {
      if (!s.name?.trim()) throw new Error("Nombre requerido");
      if (s.id) {
        const { error } = await supabase.from("suppliers").update({
          name: s.name, category: s.category, contact_name: s.contact_name,
          phone: s.phone, email: s.email, notes: s.notes,
          is_active: s.is_active ?? true,
          requires_advance_payment: s.requires_advance_payment ?? false,
          advance_payment_pct: s.advance_payment_pct ?? 50,
        } as any).eq("id", s.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("suppliers").insert({
          brand_id: selectedBrandId!, name: s.name, category: s.category ?? null,
          contact_name: s.contact_name ?? null, phone: s.phone ?? null,
          email: s.email ?? null, notes: s.notes ?? null,
          requires_advance_payment: s.requires_advance_payment ?? false,
          advance_payment_pct: s.advance_payment_pct ?? 50,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Proveedor guardado");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["suppliers", selectedBrandId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Proveedor eliminado");
      qc.invalidateQueries({ queryKey: ["suppliers", selectedBrandId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" /> Proveedores
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Catálogo reutilizable usado en Producción Real.
        </p>
      </div>

      {isAdmin && (
        <section className="rounded-xl border border-border bg-surface p-5 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Configuración de margen</h2>
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <Label className="text-xs">Margen mínimo requerido (%)</Label>
              <Input type="number" min={0} max={100} step="0.1" value={minPct}
                onChange={(e) => setMinPct(e.target.value)} className="w-32" />
            </div>
            <Button size="sm" onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending} className="gap-1">
              {saveSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar
            </Button>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-sm font-medium text-muted-foreground">Catálogo</h2>
          <Button size="sm" onClick={() => setEditing({})} className="gap-1">
            <Plus className="h-4 w-4" /> Nuevo proveedor
          </Button>
        </div>

        {editing && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nombre*</Label>
                <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Categoría (sofás, camas, comedores…)</Label>
                <Input value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Contacto</Label>
                <Input value={editing.contact_name ?? ""} onChange={(e) => setEditing({ ...editing, contact_name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Teléfono</Label>
                <Input value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Email</Label>
                <Input value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Notas</Label>
                <Textarea rows={2} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => save.mutate(editing)} disabled={save.isPending} className="gap-1">
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(null)} className="gap-1">
                <X className="h-4 w-4" /> Cancelar
              </Button>
            </div>
          </div>
        )}

        {list.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (list.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay proveedores.</p>
        ) : (
          <ul className="space-y-2">
            {list.data!.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-2 rounded-lg border border-border bg-background p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{s.name}{s.category && <span className="text-muted-foreground"> · {s.category}</span>}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {s.contact_name && <>{s.contact_name} · </>}
                    {s.phone && <>{s.phone} · </>}
                    {s.email}
                  </p>
                  {s.notes && <p className="text-xs text-muted-foreground mt-1">{s.notes}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button>
                  {isAdmin && (
                    <Button size="icon" variant="ghost" className="text-destructive"
                      onClick={() => { if (confirm(`¿Eliminar ${s.name}?`)) remove.mutate(s.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
