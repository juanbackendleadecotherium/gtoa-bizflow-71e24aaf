import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { getSupplierAdvancePaymentForItem } from "@/lib/supplier-advance-payments.functions";

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s.length === 10 ? s + "T00:00:00" : s);
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

export function SupplierAdvancePaymentCard({ orderItemId }: { orderItemId: string }) {
  const getFn = useServerFn(getSupplierAdvancePaymentForItem);
  const q = useQuery({
    queryKey: ["supplier-advance-payment", orderItemId],
    queryFn: () => getFn({ data: { orderItemId } }),
  });

  if (q.isLoading) {
    return (
      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5 flex items-center gap-2 text-[11px] text-emerald-700 dark:text-emerald-300">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando pago…
      </div>
    );
  }
  if (!q.data) return null;
  const p = q.data;
  return (
    <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Pago anticipado confirmado · inicio real {fmtDate(p.paid_at)}
      </div>
      <div className="text-[11px] text-foreground/90">
        <strong>{fmtMoney(Number(p.amount))}</strong> a {p.supplier_name_snapshot}
        {p.created_by_email && <span className="text-muted-foreground"> · registrado por {p.created_by_email}</span>}
      </div>
      <a
        href={p.receipt_signed_url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
      >
        <ExternalLink className="h-3 w-3" /> Ver comprobante
      </a>
    </div>
  );
}
