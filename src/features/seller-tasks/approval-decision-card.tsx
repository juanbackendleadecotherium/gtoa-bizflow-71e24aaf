import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Loader2, ShieldCheck, ArrowRight, Receipt, Tag, User } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Tarjeta accionable dentro de "Mis tareas" del admin para aprobar/rechazar
 * una solicitud de aprobación gerencial. Rechazar anula la venta.
 */
export function ApprovalDecisionCard({
  taskId: _taskId,
  orderId,
  title,
  reason,
  createdAt,
  orderNumber,
  invoiceNumber,
  customerName,
  brandName,
}: {
  taskId: string;
  orderId: string | null;
  title: string;
  reason: string | null;
  createdAt: string;
  orderNumber?: string | null;
  invoiceNumber?: string | null;
  customerName?: string | null;
  brandName?: string | null;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [expanded, setExpanded] = useState(false);

  const resolve = useMutation({
    mutationFn: async (decision: "aprobada" | "rechazada") => {
      if (!orderId) throw new Error("La tarea no tiene venta asociada");
      if (decision === "rechazada" && !note.trim()) {
        throw new Error("Escribe el motivo del rechazo (la venta se anula)");
      }
      const { error } = await supabase.rpc("resolve_management_approval", {
        p_order_id: orderId,
        p_decision: decision,
        p_note: note.trim() || undefined,
      });
      if (error) throw error;
      return decision;
    },
    onSuccess: (decision) => {
      toast.success(decision === "aprobada" ? "Venta aprobada" : "Venta rechazada y anulada");
      setNote("");
      setExpanded(false);
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      qc.invalidateQueries({ queryKey: ["my-tasks-count"] });
      qc.invalidateQueries({ queryKey: ["order-approvals-pending"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-xl border p-4 border-amber-500/60 bg-amber-500/5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" /> {title}
          </p>
          {reason && (
            <div className="mt-2 rounded-md p-2.5 border bg-amber-500/10 border-amber-500/30">
              <p className="text-sm text-foreground whitespace-pre-wrap">{reason}</p>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-2">
            Creada: {new Date(createdAt).toLocaleString("es-CO")}
          </p>
        </div>
        {orderId && (
          <Link
            to="/erp/orders/$id"
            params={{ id: orderId }}
            className="text-xs text-primary inline-flex items-center gap-1 hover:underline shrink-0"
          >
            Ver venta <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      {!expanded ? (
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" className="gap-1" onClick={() => setExpanded(true)}>
            <ShieldCheck className="h-3.5 w-3.5" /> Decidir
          </Button>
        </div>
      ) : (
        <div className="space-y-2 pt-2 border-t border-amber-500/30">
          <Textarea
            placeholder="Comentario (opcional al aprobar, obligatorio al rechazar)…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="text-xs"
          />
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              className="gap-1"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate("aprobada")}
            >
              {resolve.isPending && resolve.variables === "aprobada"
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <CheckCircle2 className="h-3.5 w-3.5" />}
              Aprobar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1 border-rose-500/40 text-rose-600 hover:bg-rose-500/10"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate("rechazada")}
            >
              {resolve.isPending && resolve.variables === "rechazada"
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <XCircle className="h-3.5 w-3.5" />}
              Rechazar y anular venta
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setExpanded(false)} disabled={resolve.isPending}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
