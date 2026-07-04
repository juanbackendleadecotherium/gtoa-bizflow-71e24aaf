import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, DollarSign, Check, X, Send, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useBrand } from "@/features/brands/brand-context";
import { formatMoney } from "@/features/orders/order-items-editor";
import {
  listCommissions,
  approveCommission,
  rejectCommission,
  payCommission,
  listCommissionTiers,
  type CommissionRow,
} from "@/lib/commissions.functions";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/erp/finance/commissions")({
  head: () => ({ meta: [{ title: "Comisiones — Grupo Getova" }] }),
  component: CommissionsPage,
});

const STATUSES: Array<{ v: "pendiente" | "aprobada" | "rechazada" | "pagada"; label: string }> = [
  { v: "pendiente", label: "Pendientes" },
  { v: "aprobada", label: "Aprobadas" },
  { v: "pagada", label: "Pagadas" },
  { v: "rechazada", label: "Rechazadas" },
];

function CommissionsPage() {
  const { isAdmin, roles } = useBrand();
  const isFinance = isAdmin || roles.includes("finanzas");
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pendiente" | "aprobada" | "pagada" | "rechazada">("pendiente");

  const listFn = useServerFn(listCommissions);
  const tiersFn = useServerFn(listCommissionTiers);
  const approveFn = useServerFn(approveCommission);
  const rejectFn = useServerFn(rejectCommission);
  const payFn = useServerFn(payCommission);

  const q = useQuery({
    queryKey: ["commissions", tab],
    queryFn: () => listFn({ data: { status: tab } }),
  });

  const tiersQ = useQuery({ queryKey: ["commission-tiers"], queryFn: () => tiersFn() });

  const approve = useMutation({
    mutationFn: (id: string) => approveFn({ data: { id } }),
    onSuccess: () => { toast.success("Comisión aprobada"); qc.invalidateQueries({ queryKey: ["commissions"] }); qc.invalidateQueries({ queryKey: ["commissions-pending-count"] }); },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });
  const reject = useMutation({
    mutationFn: (v: { id: string; reason: string }) => rejectFn({ data: v }),
    onSuccess: () => { toast.success("Comisión rechazada"); qc.invalidateQueries({ queryKey: ["commissions"] }); qc.invalidateQueries({ queryKey: ["commissions-pending-count"] }); },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });
  const pay = useMutation({
    mutationFn: (v: { id: string; reference?: string }) => payFn({ data: v }),
    onSuccess: () => { toast.success("Comisión pagada"); qc.invalidateQueries({ queryKey: ["commissions"] }); },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  if (!isFinance) return <p className="text-sm text-muted-foreground">Solo administración o finanzas.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> Comisiones de vendedores
        </h2>
      </div>

      {/* Tiers reference */}
      <details className="rounded-xl border border-border bg-surface p-4 text-sm">
        <summary className="cursor-pointer font-medium">Tramos de comisión vigentes</summary>
        <div className="mt-3">
          {tiersQ.data && tiersQ.data.length > 0 ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1">Desde</th><th>Hasta</th><th>%</th>
                </tr>
              </thead>
              <tbody>
                {tiersQ.data.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="py-1 tabular-nums">{formatMoney(t.min_amount)}</td>
                    <td className="tabular-nums">{t.max_amount == null ? "En adelante" : formatMoney(t.max_amount)}</td>
                    <td className="font-medium">{t.percentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-muted-foreground">Sin tramos configurados.</p>}
        </div>
      </details>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          {STATUSES.map((s) => (
            <TabsTrigger key={s.v} value={s.v}>{s.label}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab} className="mt-4 space-y-2">
          {q.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (q.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground rounded-xl border border-dashed p-8 text-center">
              Sin comisiones {STATUSES.find(s => s.v === tab)?.label.toLowerCase()}.
            </p>
          ) : (
            <ul className="space-y-2">
              {(q.data ?? []).map((c) => (
                <CommissionCard
                  key={c.id}
                  c={c}
                  isAdmin={isAdmin}
                  isFinance={isFinance}
                  onApprove={() => approve.mutate(c.id)}
                  onReject={(reason) => reject.mutate({ id: c.id, reason })}
                  onPay={(reference) => pay.mutate({ id: c.id, reference })}
                />
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CommissionCard({
  c, isAdmin, isFinance, onApprove, onReject, onPay,
}: {
  c: CommissionRow;
  isAdmin: boolean;
  isFinance: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onPay: (reference: string | undefined) => void;
}) {
  const statusClass =
    c.status === "pendiente" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40"
    : c.status === "aprobada" ? "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40"
    : c.status === "pagada" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40"
    : c.status === "rechazada" ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40"
    : "bg-muted text-muted-foreground border-border";

  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-medium">{c.seller_label ?? "—"}</p>
            <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${statusClass}`}>
              {c.status}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {c.brand_name} · {new Date(c.period_month).toLocaleDateString("es-CO", { month: "long", year: "numeric" })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Venta: <span className="font-medium text-foreground tabular-nums">{formatMoney(c.sale_amount)}</span>
            {" · "}Ventas del mes: <span className="tabular-nums">{formatMoney(c.seller_monthly_sales)}</span>
            {" · "}Tramo: <span className="font-medium">{c.tier_percentage}%</span>
          </p>
          <p className="text-sm font-display font-semibold tabular-nums mt-1">
            Comisión: {formatMoney(c.commission_amount)}
          </p>
          {c.invoice_number || c.order_number ? (
            <Link
              to="/erp/orders/$id"
              params={{ id: c.order_id }}
              className="text-xs text-primary inline-flex items-center gap-1 hover:underline mt-1"
            >
              Fact. {c.invoice_number ?? c.order_number} <ExternalLink className="h-3 w-3" />
            </Link>
          ) : null}
          {c.rejection_reason && (
            <p className="text-xs text-rose-700 dark:text-rose-300 mt-2">Motivo rechazo: {c.rejection_reason}</p>
          )}
          {c.paid_reference && (
            <p className="text-xs text-muted-foreground mt-1">Referencia pago: {c.paid_reference}</p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {c.status === "pendiente" && isAdmin && (
            <>
              <Button size="sm" className="gap-1" onClick={onApprove}>
                <Check className="h-3.5 w-3.5" /> Aprobar
              </Button>
              <RejectDialog onSubmit={onReject} />
            </>
          )}
          {c.status === "aprobada" && isFinance && (
            <PayDialog onSubmit={onPay} amount={c.commission_amount} />
          )}
        </div>
      </div>
    </li>
  );
}

function RejectDialog({ onSubmit }: { onSubmit: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1"><X className="h-3.5 w-3.5" /> Rechazar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Rechazar comisión</DialogTitle></DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo del rechazo (mínimo 5 caracteres)"
          rows={4}
        />
        <DialogFooter>
          <Button
            disabled={reason.trim().length < 5}
            onClick={() => { onSubmit(reason.trim()); setOpen(false); setReason(""); }}
          >
            Confirmar rechazo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({ onSubmit, amount }: { onSubmit: (ref: string | undefined) => void; amount: number }) {
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1"><Send className="h-3.5 w-3.5" /> Marcar como pagada</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Pago de comisión ({formatMoney(amount)})</DialogTitle></DialogHeader>
        <div>
          <label className="text-xs text-muted-foreground">Referencia / observación (opcional)</label>
          <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Nº transferencia, banco…" />
        </div>
        <DialogFooter>
          <Button onClick={() => { onSubmit(ref.trim() || undefined); setOpen(false); setRef(""); }}>
            Confirmar pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
