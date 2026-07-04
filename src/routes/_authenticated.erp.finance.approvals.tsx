import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ShieldCheck, Loader2, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/features/orders/order-items-editor";

export const Route = createFileRoute("/_authenticated/erp/finance/approvals")({
  head: () => ({ meta: [{ title: "Aprobaciones gerenciales — Grupo Getova" }] }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["order-approvals-pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id, order_number, invoice_number, total, advance_amount,
          customer_name, customer_phone, approval_status, approval_note,
          approval_requested_at, approval_requested_by,
          brand:brands(name, slug, primary_color)
        `)
        .eq("approval_status", "pendiente")
        .order("approval_requested_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Aprobaciones gerenciales pendientes
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Ventas con anticipo menor al 50% que esperan tu decisión antes de entrar a producción.
          </p>
        </div>
        <span className="rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 px-2.5 py-1 text-xs font-medium">
          {q.data?.length ?? 0} pendiente{(q.data?.length ?? 0) === 1 ? "" : "s"}
        </span>
      </div>

      {q.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (q.data ?? []).length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-medium">No hay solicitudes pendientes</p>
          <p className="text-xs text-muted-foreground mt-1">Todas las excepciones de anticipo están resueltas.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {(q.data ?? []).map((o: any) => (
            <ApprovalRow key={o.id} order={o} onResolved={() => qc.invalidateQueries({ queryKey: ["order-approvals-pending"] })} />
          ))}
        </div>
      )}
    </div>
  );
}

function ApprovalRow({ order, onResolved }: { order: any; onResolved: () => void }) {
  const [note, setNote] = useState("");
  const [expanded, setExpanded] = useState(false);
  const total = Number(order.total ?? 0);
  const advance = Number(order.advance_amount ?? 0);
  const pct = total > 0 ? (advance / total) * 100 : 0;

  const resolve = useMutation({
    mutationFn: async (decision: "aprobada" | "rechazada") => {
      if (decision === "rechazada" && !note.trim()) {
        throw new Error("Escribe el motivo del rechazo");
      }
      const { error } = await supabase.rpc("resolve_management_approval", {
        p_order_id: order.id,
        p_decision: decision,
        p_note: note.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Decisión registrada");
      setNote("");
      onResolved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to="/erp/orders/$id" params={{ id: order.id }}
              className="font-mono text-sm font-semibold hover:text-primary">
              {order.order_number || order.invoice_number || "—"}
            </Link>
            {order.brand?.name && (
              <span className="text-[11px] px-2 py-0.5 rounded-full border border-border bg-muted">
                {order.brand.name}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {order.customer_name} {order.customer_phone && `· ${order.customer_phone}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Anticipo</p>
          <p className="font-semibold tabular-nums">
            {formatMoney(advance)} <span className="text-xs text-amber-600">({pct.toFixed(1)}%)</span>
          </p>
          <p className="text-[11px] text-muted-foreground">de {formatMoney(total)}</p>
        </div>
      </div>

      {order.approval_note && (
        <div className="rounded-lg border border-border bg-muted/30 p-2.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Motivo del vendedor</p>
          <p className="text-xs whitespace-pre-wrap">{order.approval_note}</p>
        </div>
      )}

      {!expanded ? (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] text-muted-foreground">
            Solicitada {order.approval_requested_at ? new Date(order.approval_requested_at).toLocaleString("es-CO") : "—"}
          </p>
          <div className="flex gap-2">
            <Link to="/erp/orders/$id" params={{ id: order.id }}>
              <Button size="sm" variant="ghost" className="gap-1 text-xs">
                Ver detalle <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
            <Button size="sm" onClick={() => setExpanded(true)} className="gap-1">
              <ShieldCheck className="h-3.5 w-3.5" /> Decidir
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 pt-2 border-t border-border">
          <Textarea
            placeholder="Comentario (opcional al aprobar, obligatorio al rechazar)…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="text-xs"
          />
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" disabled={resolve.isPending}
              onClick={() => resolve.mutate("aprobada")} className="gap-1">
              {resolve.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Aprobar
            </Button>
            <Button size="sm" variant="outline" disabled={resolve.isPending}
              onClick={() => resolve.mutate("rechazada")}
              className="gap-1 border-rose-500/40 text-rose-600 hover:bg-rose-500/10">
              <XCircle className="h-3.5 w-3.5" /> Rechazar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setExpanded(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
