import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Calendar, History, Loader2, AlarmClockCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  deferOrderDelivery,
  listOrderDeferrals,
} from "@/lib/orders-delivery.functions";

export function DeliveryDeferralCard({
  orderId,
  estimatedDate,
  scheduledDate,
  isDeferred,
  deferredReason,
  canEdit,
  onDone,
}: {
  orderId: string;
  estimatedDate: string | null;
  scheduledDate: string | null;
  isDeferred: boolean;
  deferredReason: string | null;
  canEdit: boolean;
  onDone: () => void;
}) {
  const listFn = useServerFn(listOrderDeferrals);
  const historyQ = useQuery({
    queryKey: ["order-deferrals", orderId],
    queryFn: () => listFn({ data: { orderId } }),
  });

  const current = scheduledDate ?? estimatedDate;

  return (
    <section className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> Entrega
          </p>
          <p className="mt-1 text-sm">
            Pactada:{" "}
            <span className="font-medium">
              {estimatedDate ? new Date(estimatedDate).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" }) : "—"}
            </span>
          </p>
          <p className="text-sm">
            Programada:{" "}
            <span className="font-medium">
              {current ? new Date(current).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" }) : "—"}
            </span>
            {isDeferred && (
              <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/40">
                Diferida
              </span>
            )}
          </p>
          {isDeferred && deferredReason && (
            <p className="text-xs text-muted-foreground mt-1">Motivo: {deferredReason}</p>
          )}
          <p className="text-[11px] text-muted-foreground mt-2 max-w-prose">
            El recaudo semanal se ancla a la fecha en que ingresa el pago, no a la fecha de entrega.
            Aplazar solo mueve la entrega física — el dinero cobrado se conserva en la semana original.
          </p>
        </div>
        {canEdit && (
          <DeferDialog
            orderId={orderId}
            currentDate={current}
            onDone={onDone}
          />
        )}
      </div>

      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
          <History className="h-3 w-3" /> Historial de aplazamientos ({historyQ.data?.length ?? 0})
        </summary>
        <div className="mt-2 ml-2 border-l-2 border-border pl-3 space-y-2">
          {historyQ.isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : (historyQ.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Sin aplazamientos registrados.</p>
          ) : (
            (historyQ.data ?? []).map((d) => (
              <div key={d.id} className="text-xs">
                <p>
                  <span className="font-medium">
                    {d.previous_date ? new Date(d.previous_date).toLocaleDateString("es-CO") : "—"}
                  </span>
                  {" → "}
                  <span className="font-semibold text-violet-700 dark:text-violet-300">
                    {new Date(d.new_date).toLocaleDateString("es-CO")}
                  </span>
                  <span className="text-muted-foreground">
                    {" · "}{d.created_by_email ?? "—"}{" · "}
                    {new Date(d.created_at).toLocaleString("es-CO")}
                  </span>
                </p>
                <p className="text-muted-foreground">Motivo: {d.reason}</p>
              </div>
            ))
          )}
        </div>
      </details>
    </section>
  );
}

function DeferDialog({
  orderId,
  currentDate,
  onDone,
}: {
  orderId: string;
  currentDate: string | null;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [newDate, setNewDate] = useState(currentDate ?? "");
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const deferFn = useServerFn(deferOrderDelivery);

  const mut = useMutation({
    mutationFn: () => deferFn({ data: { orderId, newDate, reason: reason.trim() } }),
    onSuccess: () => {
      toast.success("Entrega aplazada");
      qc.invalidateQueries({ queryKey: ["order-deferrals", orderId] });
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      onDone();
      setOpen(false);
      setReason("");
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setNewDate(currentDate ?? ""); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <AlarmClockCheck className="h-3.5 w-3.5" /> Aplazar entrega
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Aplazar entrega</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Nueva fecha de entrega</label>
            <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Motivo (mín. 5 caracteres)</label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: cliente pidió recibir la próxima semana"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Esta acción solo mueve la fecha de entrega. Los pagos ya registrados
            permanecen en la semana en que se cobraron.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            disabled={!newDate || reason.trim().length < 5 || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar aplazamiento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
