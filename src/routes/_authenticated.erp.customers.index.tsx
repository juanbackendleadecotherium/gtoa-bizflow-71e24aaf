import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Search, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CustomerForm } from "@/features/customers/customer-form";
import type { CustomerInput } from "@/features/customers/schemas";

export const Route = createFileRoute("/_authenticated/erp/customers/")({
  component: CustomersPage,
});

function CustomersPage() {
  const { selectedBrandId, selectedBrand } = useBrand();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const customersQuery = useQuery({
    queryKey: ["customers", selectedBrandId, search],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      let q = supabase
        .from("customers")
        .select("id, display_name, email, phone, city, is_active, doc_number")
        .eq("brand_id", selectedBrandId!)
        .order("display_name");
      if (search.trim()) {
        q = q.ilike("display_name", `%${search.trim()}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: CustomerInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        brand_id: selectedBrandId!,
        created_by: user?.id,
        display_name: input.display_name,
        doc_type: input.doc_type || null,
        doc_number: input.doc_number || null,
        email: input.email || null,
        phone: input.phone || null,
        address: input.address || null,
        city: input.city || null,
        notes: input.notes || null,
        is_active: input.is_active,
      };
      const { data, error } = await supabase.from("customers").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Cliente creado");
      qc.invalidateQueries({ queryKey: ["customers"] });
      setCreating(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!selectedBrandId) {
    return <p className="text-sm text-muted-foreground">Selecciona una marca para ver sus clientes.</p>;
  }

  return (
    <>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-1">{selectedBrand?.name}</p>
          <h1 className="font-display text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">Cartera de la marca activa.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link to="/erp/orders/whatsapp">
              <Sparkles className="h-4 w-4" /> Crear con IA (WhatsApp)
            </Link>
          </Button>
          <Button onClick={() => setCreating(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Nuevo cliente
          </Button>
        </div>
      </div>

      <div className="mb-4 relative max-w-sm">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre…" className="pl-9" />
      </div>

      {creating && (
        <div className="mb-6 rounded-xl border border-border bg-surface p-5">
          <p className="font-medium mb-3">Nuevo cliente</p>
          <CustomerForm
            onCancel={() => setCreating(false)}
            onSubmit={(v: CustomerInput) => createMutation.mutate(v)}
            submitting={createMutation.isPending}
          />
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        {customersQuery.isLoading ? (
          <div className="p-8 grid place-items-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : (customersQuery.data ?? []).length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Sin clientes todavía.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Nombre</th>
                <th className="text-left px-4 py-3">Documento</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Teléfono</th>
                <th className="text-left px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {customersQuery.data!.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link to="/erp/customers/$id" params={{ id: c.id }} className="font-medium hover:text-accent">
                      {c.display_name}
                    </Link>
                    {c.city && <p className="text-xs text-muted-foreground">{c.city}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.doc_number || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.email || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.phone || "—"}</td>
                  <td className="px-4 py-3">
                    {c.is_active ? <Badge variant="outline" className="border-accent/40 text-accent">Activo</Badge> : <Badge variant="outline">Inactivo</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}