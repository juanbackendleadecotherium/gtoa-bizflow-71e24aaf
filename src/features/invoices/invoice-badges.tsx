import { FileText, CheckCircle2, Clock, Circle } from "lucide-react";
import { formatMoney } from "@/features/orders/order-items-editor";

export function PaymentBadge({ total, advance }: { total: number; advance: number }) {
  if (total <= 0) return null;
  if (advance >= total) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-medium">
        <CheckCircle2 className="h-3 w-3" /> Pagada
      </span>
    );
  }
  if (advance > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-2 py-0.5 text-[11px] font-medium">
        <Clock className="h-3 w-3" /> Abono · Saldo {formatMoney(total - advance)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground border border-border px-2 py-0.5 text-[11px] font-medium">
      <Circle className="h-3 w-3" /> Sin abono
    </span>
  );
}

export function InvoicedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 text-[11px] font-medium">
      <FileText className="h-3 w-3" /> Facturada
    </span>
  );
}
