import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { confirmSupplierAdvancePayment } from "@/lib/supplier-advance-payments.functions";

/**
 * Inline "Pagado al proveedor" check for suppliers that do NOT require a
 * mandatory advance payment. Lets the user declare the payment % (default 50,
 * editable up to 100) without uploading a receipt. Confirming triggers the
 * existing start_real_production flow (same as the full advance-payment form).
 */
export function SupplierQuickPaymentCheck({
  orderItemId,
  supplierName,
  suggestedCost,
}: {
  orderItemId: string;
  supplierName: string;
  suggestedCost?: number | null;
}) {
  const qc = useQueryClient();
  const confirmFn = useServerFn(confirmSupplierAdvancePayment);
  const today = new Date().toISOString().slice(0, 10);

  const [checked, setChecked] = useState(false);
  const [pct, setPct] = useState<number>(50);
  const [paidAt, setPaidAt] = useState<string>(today);

  const amount =
    suggestedCost != null && pct > 0
      ? Math.round(Number(suggestedCost) * (pct / 100))
      : 0;

  const submit = useMutation({
    mutationFn: async () => {
      if (!checked) throw new Error("Marca la casilla para confirmar el pago");
      if (!(pct > 0 && pct <= 100)) throw new Error("Porcentaje inválido (1-100)");
      if (!(amount > 0)) throw new Error("Costo proveedor inválido");
      await confirmFn({
        data: {
          orderItemId,
          amount,
          paidAt,
          receiptPath: null,
          receiptMime: null,
          receiptSizeBytes: null,
        },
      });
    },
    onSuccess: () => {
      toast.success(`Pago al ${supplierName} registrado. Producción iniciada.`);
      qc.invalidateQueries({ queryKey: ["production-orders-drive"] });
      qc.invalidateQueries({ queryKey: ["supplier-advance-payment", orderItemId] });
      qc.invalidateQueries({ queryKey: ["my-tasks-count"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error al registrar el pago"),
  });

  const noCost = !(suggestedCost && Number(suggestedCost) > 0);

  return (
    <div className="rounded-md border border-border bg-surface p-2.5 space-y-2">
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
        />
        <span className="text-[11px] leading-snug">
          Ya se le pagó al proveedor <strong>{supplierName}</strong>
        </span>
      </label>

      {checked && (
        <div className="space-y-2 pl-6">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                % pagado
              </span>
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                value={pct}
                onChange={(e) => setPct(Number(e.target.value))}
                className="w-16 h-7 rounded-md border border-border bg-background px-1.5 text-xs outline-none focus:border-primary"
              />
              <span className="text-[10px] text-muted-foreground">%</span>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                Fecha
              </span>
              <input
                type="date"
                value={paidAt}
                max={today}
                onChange={(e) => setPaidAt(e.target.value)}
                className="h-7 rounded-md border border-border bg-background px-1.5 text-xs outline-none focus:border-primary"
              />
            </label>
          </div>

          {noCost ? (
            <p className="text-[10px] text-amber-600 dark:text-amber-400">
              Define primero el costo del proveedor para calcular el monto.
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground">
              Monto a registrar:{" "}
              <strong className="text-foreground">
                {new Intl.NumberFormat("es-CO", {
                  style: "currency",
                  currency: "COP",
                  maximumFractionDigits: 0,
                }).format(amount)}
              </strong>{" "}
              ({pct}% de{" "}
              {new Intl.NumberFormat("es-CO", {
                style: "currency",
                currency: "COP",
                maximumFractionDigits: 0,
              }).format(Number(suggestedCost))}
              )
            </p>
          )}

          <button
            type="button"
            onClick={() => submit.mutate()}
            disabled={submit.isPending || noCost}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary hover:bg-primary/90 text-white text-[11px] font-semibold px-2.5 py-1.5 disabled:opacity-50"
          >
            {submit.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            Confirmar pago / Inicio real
          </button>
          <p className="text-[10px] text-muted-foreground italic">
            Esta acción es definitiva e inicia la producción del ítem.
          </p>
        </div>
      )}
    </div>
  );
}
