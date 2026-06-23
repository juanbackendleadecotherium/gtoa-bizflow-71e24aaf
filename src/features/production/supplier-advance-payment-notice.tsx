import { AlertCircle } from "lucide-react";

export function SupplierAdvancePaymentNotice({ pct = 50, supplierName }: { pct?: number; supplierName?: string | null }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
      <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>
        <strong>{supplierName ?? "Este proveedor"}</strong> requiere pago del {pct}% para iniciar producción.
      </span>
    </div>
  );
}
