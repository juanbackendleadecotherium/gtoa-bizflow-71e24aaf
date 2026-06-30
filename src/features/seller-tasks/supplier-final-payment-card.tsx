import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, X, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  confirmSupplierFinalPayment,
  getFinalPaymentMeta,
} from "@/lib/supplier-advance-payments.functions";

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function SupplierFinalPaymentCard({
  taskId,
  orderItemId,
  reason,
  title,
}: {
  taskId: string;
  orderItemId: string;
  reason: string | null;
  title: string;
}) {
  const qc = useQueryClient();
  const metaFn = useServerFn(getFinalPaymentMeta);
  const confirmFn = useServerFn(confirmSupplierFinalPayment);

  const metaQ = useQuery({
    queryKey: ["final-payment-meta", orderItemId],
    queryFn: () => metaFn({ data: { orderItemId } }),
  });
  const meta = metaQ.data;

  const [confirming, setConfirming] = useState(false);
  const [amount, setAmount] = useState<string>("");

  const confirmMut = useMutation({
    mutationFn: () =>
      confirmFn({
        data: {
          orderItemId,
          amount: Number(amount),
        },
      }),
    onSuccess: () => {
      toast.success("Pago final registrado");
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      qc.invalidateQueries({ queryKey: ["my-tasks-count"] });
      qc.invalidateQueries({ queryKey: ["final-payment-meta", orderItemId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const dismiss = useMutation({
    mutationFn: async () => {
      // "No" — la tarea se mantiene pendiente; sólo cerramos el formulario
      return true;
    },
    onSuccess: () => {
      setConfirming(false);
      toast("La tarea queda pendiente hasta confirmar el pago");
    },
  });

  return (
    <div className="rounded-xl border border-amber-500/50 bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <DollarSign className="h-4 w-4 text-amber-700 dark:text-amber-300 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold">{title}</p>
          {reason && (
            <p className="text-xs whitespace-pre-wrap text-foreground/80 mt-1">{reason}</p>
          )}
        </div>
      </div>

      {meta && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <Stat label="Costo total" value={COP.format(meta.totalCost)} />
          <Stat label="Anticipo" value={COP.format(meta.paid)} />
          <Stat
            label="Saldo por pagar"
            value={COP.format(meta.remaining)}
            highlight
          />
        </div>
      )}

      {!confirming ? (
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => {
              setAmount(String(meta?.remaining ?? ""));
              setConfirming(true);
            }}
          >
            <Check className="h-4 w-4" /> Sí, ya pagué
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => dismiss.mutate()}
          >
            <X className="h-4 w-4" /> Aún no
          </Button>
        </div>
      ) : (
        <div className="space-y-2 border-t border-amber-500/30 pt-3">
          <div className="space-y-1">
            <Label className="text-xs">Monto pagado (COP)</Label>
            <Input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => confirmMut.mutate()}
              disabled={!amount || Number(amount) <= 0 || confirmMut.isPending}
            >
              {confirmMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar pago
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-md border p-2 ${
        highlight
          ? "bg-amber-500/10 border-amber-500/40"
          : "bg-background border-border"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? "text-amber-800 dark:text-amber-200" : ""}`}>
        {value}
      </p>
    </div>
  );
}
