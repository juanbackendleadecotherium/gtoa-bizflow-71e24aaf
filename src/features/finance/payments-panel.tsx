import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Plus, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatMoney } from "@/features/orders/order-items-editor";
import { useBrand } from "@/features/brands/brand-context";
import { PaymentDialog } from "./payment-dialog";
import { formatDepositAccount } from "./deposit-accounts";

type Payment = {
  id: string;
  amount: number;
  paid_at: string;
  method: string | null;
  reference: string | null;
  note: string | null;
  proof_url: string | null;
  created_by_email: string | null;
  deposit_account: string | null;
};

export function PaymentsPanel({
  orderId, brandId, total, advance,
}: {
  orderId: string; brandId: string; total: number; advance: number;
}) {
  const qc = useQueryClient();
  const { isAdmin } = useBrand();
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["order-payments", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_payments")
        .select("id, amount, paid_at, method, reference, note, proof_url, created_by_email")
        .eq("order_id", orderId)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Payment[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("order_payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pago eliminado");
      qc.invalidateQueries({ queryKey: ["order-payments", orderId] });
      qc.invalidateQueries({ queryKey: ["order-audit", orderId] });
      qc.invalidateQueries({ queryKey: ["finance-dashboard"] });
      qc.invalidateQueries({ queryKey: ["finance-receivables"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const payments = q.data ?? [];
  const paymentsSum = payments.reduce((s, p) => s + Number(p.amount), 0);
  const paid = Number(advance || 0) + paymentsSum;
  const balance = Math.max(0, Number(total || 0) - paid);
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const status = balance === 0 && total > 0 ? "Pagada" : paid > 0 ? "Con abonos" : "Sin abonos";
  const statusColor = balance === 0
    ? "text-emerald-600 dark:text-emerald-400"
    : paid > 0
    ? "text-amber-600 dark:text-amber-400"
    : "text-muted-foreground";

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Banknote className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">Pagos</p>
        </div>
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${statusColor}`}>{status}</span>
      </div>

      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="tabular-nums">{formatMoney(total)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Abono inicial</span><span className="tabular-nums">{formatMoney(advance)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Pagos posteriores</span><span className="tabular-nums">{formatMoney(paymentsSum)}</span></div>
        <div className="flex justify-between pt-1 border-t border-border mt-1">
          <span className="text-muted-foreground font-medium">Saldo</span>
          <span className="tabular-nums font-semibold">{formatMoney(balance)}</span>
        </div>
        <Progress value={pct} className="h-1.5 mt-2" />
        <p className="text-[10px] text-muted-foreground text-right">{pct}% pagado</p>
      </div>

      <Button size="sm" className="w-full gap-2 mt-3" onClick={() => setOpen(true)} disabled={balance <= 0}>
        <Plus className="h-3.5 w-3.5" />
        {balance <= 0 ? "Sin saldo pendiente" : "Registrar pago"}
      </Button>

      {q.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin mt-3 text-muted-foreground" />
      ) : payments.length > 0 ? (
        <ul className="mt-4 pt-3 border-t border-border space-y-2">
          {payments.map((p) => (
            <li key={p.id} className="rounded-md border border-border bg-background px-2.5 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="tabular-nums font-medium">{formatMoney(p.amount)}</span>
                <span className="text-muted-foreground">{new Date(p.paid_at + "T00:00:00").toLocaleDateString("es-CO")}</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between text-muted-foreground">
                <span>{p.method || "—"}{p.reference ? ` · ${p.reference}` : ""}</span>
                <div className="flex items-center gap-2">
                  {p.proof_url && (
                    <a href={p.proof_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
                      <ExternalLink className="h-3 w-3" />Comprobante
                    </a>
                  )}
                  {isAdmin && (
                    <button onClick={() => del.mutate(p.id)} className="text-muted-foreground hover:text-destructive" title="Eliminar">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              {p.note && <p className="mt-1 text-foreground/80">{p.note}</p>}
              {p.created_by_email && <p className="mt-0.5 text-[10px] text-muted-foreground">Registrado por {p.created_by_email}</p>}
            </li>
          ))}
        </ul>
      ) : null}

      <PaymentDialog open={open} onOpenChange={setOpen} orderId={orderId} brandId={brandId} balance={balance} />
    </div>
  );
}
