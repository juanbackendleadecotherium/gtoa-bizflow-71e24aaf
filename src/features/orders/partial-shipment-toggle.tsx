import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Truck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export function PartialShipmentBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-800 dark:text-amber-200 font-semibold">
      <Truck className="h-3 w-3" /> Envío parcial
    </span>
  );
}

export function PartialShipmentToggle({
  itemId,
  orderId,
  enabled,
}: {
  itemId: string;
  orderId: string;
  enabled: boolean;
}) {
  const { isAdmin, roles } = useBrand();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  const canToggle = isAdmin || roles.includes("seller");
  if (!canToggle) {
    return enabled ? <PartialShipmentBadge /> : null;
  }

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("toggle_item_partial_shipment", {
        p_item_id: itemId,
        p_enabled: !enabled,
        p_note: note.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(enabled ? "Envío parcial desactivado" : "Envío parcial activado — se notificó a producción y al vendedor");
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      qc.invalidateQueries({ queryKey: ["order-detail"] });
      setOpen(false);
      setNote("");
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo actualizar"),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold transition-colors ${
          enabled
            ? "bg-amber-500/20 text-amber-800 dark:text-amber-200 hover:bg-amber-500/30"
            : "bg-muted text-muted-foreground hover:bg-muted/70"
        }`}
        title={enabled ? "Desactivar envío parcial" : "Activar envío parcial"}
      >
        <Truck className="h-3 w-3" />
        {enabled ? "Envío parcial ON" : "Envío parcial"}
      </button>

      <Dialog open={open} onOpenChange={(v) => !m.isPending && setOpen(v)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {enabled ? "Desactivar envío parcial" : "Activar envío parcial"}
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              Excepción a la regla de cobro total. Al activarlo, este ítem podrá
              entrar a logística de forma independiente aunque el resto de la
              factura no esté terminado. Se notificará a producción y al
              vendedor. El saldo de la factura solo se cobra cuando TODOS los
              ítems estén entregados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="partial-note" className="text-xs">Nota / justificación</Label>
            <Textarea
              id="partial-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Motivo del envío parcial…"
              rows={3}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={m.isPending}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => m.mutate()} disabled={m.isPending}>
              {m.isPending ? "Guardando…" : enabled ? "Desactivar" : "Activar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
