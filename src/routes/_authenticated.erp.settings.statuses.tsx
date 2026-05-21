import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { statusSchema, type StatusInput } from "@/features/orders/schemas";

export const Route = createFileRoute("/_authenticated/erp/settings/statuses")({
  component: StatusesPage,
});

function StatusesPage() {
  const { selectedBrandId, selectedBrand, isAdmin } = useBrand();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const statusesQuery = useQuery({
    queryKey: ["statuses-admin", selectedBrandId],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_statuses").select("*")
        .eq("brand_id", selectedBrandId!).order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: StatusInput) => {
      const maxOrder = Math.max(0, ...(statusesQuery.data ?? []).map((s) => s.sort_order));
      const { error } = await supabase.from("order_statuses").insert({
        brand_id: selectedBrandId!,
        ...input,
        sort_order: maxOrder + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Estado creado"); qc.invalidateQueries({ queryKey: ["statuses-admin", selectedBrandId] }); setCreating(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await supabase.from("order_statuses").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["statuses-admin", selectedBrandId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("order_statuses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Estado eliminado"); qc.invalidateQueries({ queryKey: ["statuses-admin", selectedBrandId] }); },
    onError: (e: Error) => toast.error(`No se pudo eliminar: ${e.message}`),
  });

  const reorder = (id: string, direction: -1 | 1) => {
    const list = statusesQuery.data ?? [];
    const idx = list.findIndex((s) => s.id === id);
    const swap = list[idx + direction];
    if (!swap) return;
    updateMutation.mutate({ id, patch: { sort_order: swap.sort_order } });
    updateMutation.mutate({ id: swap.id, patch: { sort_order: list[idx].sort_order } });
  };

  if (!isAdmin) return <p className="text-sm text-muted-foreground">Solo administradores pueden configurar estados.</p>;
  if (!selectedBrandId) return <p className="text-sm text-muted-foreground">Selecciona una marca.</p>;

  return (
    <>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-1">{selectedBrand?.name}</p>
          <h1 className="font-display text-2xl font-semibold">Estados de pedido</h1>
          <p className="text-sm text-muted-foreground">Configura el flujo de estados para esta marca.</p>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-2"><Plus className="h-4 w-4" /> Nuevo estado</Button>
      </div>

      {creating && (
        <div className="mb-6 rounded-xl border border-border bg-surface p-5">
          <p className="font-medium mb-3">Nuevo estado</p>
          <StatusForm
            onCancel={() => setCreating(false)}
            onSubmit={(v) => createMutation.mutate(v)}
            submitting={createMutation.isPending}
          />
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        {statusesQuery.isLoading ? (
          <div className="p-8 grid place-items-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : (
          <ul className="divide-y divide-border">
            {(statusesQuery.data ?? []).map((s, idx, arr) => (
              <li key={s.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => reorder(s.id, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                  <button onClick={() => reorder(s.id, 1)} disabled={idx === arr.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                </div>
                <span className="h-4 w-4 rounded shrink-0" style={{ background: s.color }} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.slug}
                    {s.is_initial && <span className="ml-2 text-accent">· inicial</span>}
                    {s.is_final && <span className="ml-2">· final</span>}
                    {!s.is_active && <span className="ml-2 text-destructive">· inactivo</span>}
                  </p>
                </div>
                <Switch
                  checked={s.is_active}
                  onCheckedChange={(v) => updateMutation.mutate({ id: s.id, patch: { is_active: v } })}
                />
                <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Eliminar "${s.name}"?`)) deleteMutation.mutate(s.id); }}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function StatusForm({ onSubmit, onCancel, submitting }: { onSubmit: (v: StatusInput) => void; onCancel: () => void; submitting?: boolean }) {
  const [values, setValues] = useState<StatusInput>({
    name: "", slug: "", color: "#64748b", is_initial: false, is_final: false, is_active: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = statusSchema.safeParse(values);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => { errs[i.path.join(".")] = i.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    onSubmit(parsed.data);
  };

  return (
    <form onSubmit={handle} className="grid sm:grid-cols-2 gap-4">
      <div>
        <Label className="text-xs mb-1.5 block text-muted-foreground">Nombre *</Label>
        <Input value={values.name} onChange={(e) => {
          const name = e.target.value;
          setValues((p) => ({ ...p, name, slug: p.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }));
        }} />
        {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
      </div>
      <div>
        <Label className="text-xs mb-1.5 block text-muted-foreground">Slug *</Label>
        <Input value={values.slug} onChange={(e) => setValues((p) => ({ ...p, slug: e.target.value }))} />
        {errors.slug && <p className="text-xs text-destructive mt-1">{errors.slug}</p>}
      </div>
      <div>
        <Label className="text-xs mb-1.5 block text-muted-foreground">Color</Label>
        <Input type="color" className="h-10 p-1 w-20" value={values.color} onChange={(e) => setValues((p) => ({ ...p, color: e.target.value }))} />
      </div>
      <div className="flex items-end gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={values.is_initial} onCheckedChange={(v) => setValues((p) => ({ ...p, is_initial: v }))} />
          Inicial
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={values.is_final} onCheckedChange={(v) => setValues((p) => ({ ...p, is_final: v }))} />
          Final
        </label>
      </div>
      <div className="sm:col-span-2 flex justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={submitting}>{submitting ? "Guardando…" : "Guardar"}</Button>
      </div>
    </form>
  );
}
