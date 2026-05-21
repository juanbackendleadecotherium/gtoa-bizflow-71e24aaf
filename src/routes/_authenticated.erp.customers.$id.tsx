import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CustomerForm } from "@/features/customers/customer-form";
import type { CustomerInput } from "@/features/customers/schemas";

export const Route = createFileRoute("/_authenticated/erp/customers/$id")({
  component: CustomerDetail,
});

function CustomerDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const customerQuery = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: CustomerInput) => {
      const { error } = await supabase.from("customers").update({
        display_name: input.display_name,
        doc_type: input.doc_type || null,
        doc_number: input.doc_number || null,
        email: input.email || null,
        phone: input.phone || null,
        address: input.address || null,
        city: input.city || null,
        notes: input.notes || null,
        is_active: input.is_active,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente actualizado");
      qc.invalidateQueries({ queryKey: ["customer", id] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente eliminado");
      navigate({ to: "/erp/customers" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (customerQuery.isLoading) {
    return <div className="grid place-items-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const c = customerQuery.data;
  if (!c) return <p className="text-sm text-muted-foreground">Cliente no encontrado.</p>;

  return (
    <>
      <Link to="/erp/customers" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-3 w-3" /> Clientes
      </Link>
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-semibold">{c.display_name}</h1>
          <p className="text-sm text-muted-foreground">Editar datos del cliente.</p>
        </div>
        <Button
          variant="outline"
          className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10"
          onClick={() => { if (confirm("¿Eliminar este cliente?")) deleteMutation.mutate(); }}
          disabled={deleteMutation.isPending}
        >
          <Trash2 className="h-4 w-4" /> Eliminar
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <CustomerForm
          initial={{
            display_name: c.display_name,
            doc_type: c.doc_type ?? "",
            doc_number: c.doc_number ?? "",
            email: c.email ?? "",
            phone: c.phone ?? "",
            address: c.address ?? "",
            city: c.city ?? "",
            notes: c.notes ?? "",
            is_active: c.is_active,
          }}
          onSubmit={(v) => updateMutation.mutate(v)}
          submitting={updateMutation.isPending}
        />
      </div>
    </>
  );
}
