import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Trash2, Search } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/features/orders/order-items-editor";

export const Route = createFileRoute("/_authenticated/erp/finance/deletions")({
  head: () => ({ meta: [{ title: "Eliminaciones — Finanzas" }] }),
  component: DeletionsPage,
});

function DeletionsPage() {
  const { selectedBrandId } = useBrand();
  const [q, setQ] = useState("");

  const query = useQuery({
    queryKey: ["order-deletions", selectedBrandId],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_deletions")
        .select("id, deleted_at, order_number, invoice_number, customer_name, total, reason, deleted_by_email")
        .eq("brand_id", selectedBrandId!)
        .order("deleted_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = (query.data ?? []).filter((r: any) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return [r.order_number, r.invoice_number, r.customer_name, r.deleted_by_email, r.reason]
      .filter(Boolean).some((v: string) => v.toLowerCase().includes(s));
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" /> Ventas eliminadas
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Auditoría inmutable de cada eliminación con la razón registrada por el vendedor.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="pl-8" />
        </div>
      </div>

      {query.isLoading ? (
        <div className="grid place-items-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          Sin eliminaciones registradas para esta marca.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r: any) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {r.order_number}{r.invoice_number ? ` · Fact. ${r.invoice_number}` : ""}
                  </div>
                  <div className="font-medium truncate">{r.customer_name ?? "Sin cliente"}</div>
                </div>
                <div className="text-right">
                  <div className="font-display text-lg font-semibold tabular-nums">${formatMoney(Number(r.total ?? 0))}</div>
                  <div className="text-[11px] text-muted-foreground">{new Date(r.deleted_at).toLocaleString("es-CO")}</div>
                </div>
              </div>
              <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-sm whitespace-pre-wrap">
                <span className="text-xs uppercase tracking-wider text-muted-foreground block mb-1">Razón</span>
                {r.reason}
              </div>
              {r.deleted_by_email && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Eliminado por <span className="font-medium text-foreground/80">{r.deleted_by_email}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
