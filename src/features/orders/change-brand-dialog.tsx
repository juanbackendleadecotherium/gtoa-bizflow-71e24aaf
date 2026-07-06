import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";

export function ChangeBrandDialog({
  open, onOpenChange, orderId, currentBrandId, currentInvoiceNumber,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  currentBrandId: string;
  currentInvoiceNumber: string | null;
}) {
  const { brands } = useBrand();
  const qc = useQueryClient();
  const [newBrandId, setNewBrandId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);

  const targets = brands.filter((b) => b.id !== currentBrandId && b.is_active);

  const mut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("change_order_brand", {
        p_order_id: orderId,
        p_new_brand_id: newBrandId,
        p_reason: reason.trim() || "",
      });
      if (error) throw error;
      return data as { invoice_number: string; order_number: string; released_invoice_number: string | null };
    },
    onSuccess: (r) => {
      toast.success(`Marca cambiada. Nuevo folio: ${r.invoice_number}`);
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      qc.invalidateQueries({ queryKey: ["order-audit", orderId] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      onOpenChange(false);
      setNewBrandId(""); setReason(""); setConfirming(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const target = targets.find((b) => b.id === newBrandId);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setConfirming(false); } onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar marca de esta venta</DialogTitle>
          <DialogDescription>
            El folio actual <strong>{currentInvoiceNumber ?? "—"}</strong> se liberará y quedará
            disponible para la marca de origen. La venta tomará el siguiente folio disponible
            de la marca destino.
          </DialogDescription>
        </DialogHeader>

        {!confirming ? (
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs mb-1.5 block text-muted-foreground">Marca destino</Label>
              <Select value={newBrandId} onValueChange={setNewBrandId}>
                <SelectTrigger><SelectValue placeholder="Selecciona una marca" /></SelectTrigger>
                <SelectContent>
                  {targets.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block text-muted-foreground">
                Razón del cambio (opcional)
              </Label>
              <Textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej. El cliente solicitó facturar bajo otra marca del grupo."
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button disabled={!newBrandId} onClick={() => setConfirming(true)}>Continuar</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
              <div>
                Estás por mover esta venta a <strong>{target?.name}</strong>. Se reasignará su
                folio y número de orden. Esta acción queda auditada y <strong>no</strong> se puede
                deshacer con un clic.
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={mut.isPending}>
                Volver
              </Button>
              <Button
                variant="destructive"
                onClick={() => mut.mutate()}
                disabled={mut.isPending}
              >
                {mut.isPending ? "Cambiando…" : "Sí, cambiar marca"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
