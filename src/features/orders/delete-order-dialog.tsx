import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const MIN = 10;

export function DeleteOrderDialog({
  open, onOpenChange, orderId, orderNumber, customerName, onDeleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  orderNumber?: string | null;
  customerName?: string | null;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("delete_order_with_reason", {
        p_order_id: orderId,
        p_reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Venta anulada y registrada en auditoría");
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order-deletions"] });
      setReason("");
      onOpenChange(false);
      onDeleted();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = reason.trim().length >= MIN;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setReason(""); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Anular venta
          </DialogTitle>
          <DialogDescription>
            Esta acción no se puede deshacer. Quedará registrada en el historial de
            eliminaciones, visible para el administrador.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {orderNumber}
          </div>
          <div className="font-medium truncate">{customerName ?? "Sin cliente"}</div>
        </div>

        <div>
          <Label className="text-xs mb-1.5 block">
            Razón de la eliminación <span className="text-destructive">*</span>
          </Label>
          <Textarea
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: Pedido duplicado por error de digitación, el cliente reagendó…"
            autoFocus
          />
          <p className={`mt-1 text-[11px] ${valid ? "text-muted-foreground" : "text-destructive/80"}`}>
            Mínimo {MIN} caracteres ({reason.trim().length}/{MIN}).
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => mut.mutate()}
            disabled={!valid || mut.isPending}
          >
            {mut.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Anulando…</> : "Anular venta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
