import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FileEdit, Loader2, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Button } from "@/components/ui/button";
import type { DraftPayload, OrderDraftRow } from "@/features/customers/draft-types";

export function DraftsPanel({
  onOpen,
}: {
  onOpen: (draft: { id: string; payload: DraftPayload }) => void;
}) {
  const { selectedBrandId } = useBrand();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(true);

  const q = useQuery({
    queryKey: ["order-drafts", selectedBrandId],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_drafts")
        .select("id, brand_id, seller_id, payload, customer_name, items_summary, created_at, updated_at")
        .eq("brand_id", selectedBrandId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OrderDraftRow[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("order_drafts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Borrador eliminado");
      qc.invalidateQueries({ queryKey: ["order-drafts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = q.data ?? [];
  if (!selectedBrandId) return null;
  if (q.isLoading) return null;
  if (rows.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.04]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className="grid place-items-center h-9 w-9 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400">
          <FileEdit className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            Borradores de venta{" "}
            <span className="text-amber-700 dark:text-amber-400">({rows.length})</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Ventas empezadas que aún no confirmas. No consumen número de factura.
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="rounded-lg border border-border bg-background p-3 flex items-center gap-3 flex-wrap"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {r.customer_name || <span className="text-muted-foreground">Sin nombre aún</span>}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {r.items_summary || "Sin productos"} · Actualizado{" "}
                  {new Date(r.updated_at).toLocaleString("es-CO")}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onOpen({ id: r.id, payload: r.payload })}
                >
                  Abrir
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={del.isPending}
                  onClick={() => {
                    if (confirm("¿Eliminar este borrador? No se puede deshacer.")) {
                      del.mutate(r.id);
                    }
                  }}
                  aria-label="Eliminar borrador"
                >
                  {del.isPending && del.variables === r.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
