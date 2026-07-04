import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Loader2, DollarSign, Check, X, Send, ExternalLink, History, CheckSquare, Square } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useBrand } from "@/features/brands/brand-context";
import { formatMoney } from "@/features/orders/order-items-editor";
import {
  listCommissions,
  approveCommission,
  rejectCommission,
  payCommission,
  payCommissionsBulk,
  listCommissionTiers,
  getCommissionAudit,
  type CommissionRow,
  type CommissionAuditRow,
} from "@/lib/commissions.functions";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const listFn = useServerFn(listCommissions);
  const tiersFn = useServerFn(listCommissionTiers);
  const approveFn = useServerFn(approveCommission);
  const rejectFn = useServerFn(rejectCommission);
  const payFn = useServerFn(payCommission);
  const payBulkFn = useServerFn(payCommissionsBulk);

  const q = useQuery({
    queryKey: ["commissions", tab],
    queryFn: () => listFn({ data: { status: tab } }),
  });

  const tiersQ = useQuery({ queryKey: ["commission-tiers"], queryFn: () => tiersFn() });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["commissions"] });
    qc.invalidateQueries({ queryKey: ["commissions-pending-count"] });
    setSelected(new Set());
  };

  const approve = useMutation({
    mutationFn: (id: string) => approveFn({ data: { id } }),
    onSuccess: () => { toast.success("Comisión aprobada"); invalidateAll(); },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });
  const reject = useMutation({
    mutationFn: (v: { id: string; reason: string }) => rejectFn({ data: v }),
    onSuccess: () => { toast.success("Comisión rechazada"); invalidateAll(); },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });
  const pay = useMutation({
    mutationFn: (v: { id: string; reference?: string }) => payFn({ data: v }),
    onSuccess: () => { toast.success("Comisión pagada"); invalidateAll(); },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });
  const payBulk = useMutation({
    mutationFn: (v: { ids: string[]; reference?: string }) => payBulkFn({ data: v }),
    onSuccess: (r) => { toast.success(`${r.count} comisiones pagadas`); invalidateAll(); },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const rows = q.data ?? [];
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const selectedTotal = selectedRows.reduce((s, r) => s + Number(r.commission_amount), 0);

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelected(n);
  };

  if (!isFinance) return <p className="text-sm text-muted-foreground">Solo administración o finanzas.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> Comisiones de vendedores
        </h2>
      </div>

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

      <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setSelected(new Set()); }}>
        <TabsList>
          {STATUSES.map((s) => (
            <TabsTrigger key={s.v} value={s.v}>{s.label}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab} className="mt-4 space-y-2">
          {tab === "aprobada" && rows.length > 0 && (
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface/95 backdrop-blur p-3 flex-wrap">
              <button onClick={toggleAll} className="inline-flex items-center gap-2 text-sm">
                {selected.size === rows.length ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                {selected.size === rows.length ? "Deseleccionar todas" : "Seleccionar todas"}
                <span className="text-xs text-muted-foreground">({selected.size}/{rows.length})</span>
              </button>
              {selected.size > 0 && (
                <BulkPayDialog
                  rows={selectedRows}
                  total={selectedTotal}
                  loading={payBulk.isPending}
                  onSubmit={(reference) => payBulk.mutate({ ids: [...selected], reference })}
                />
              )}
            </div>
          )}
          {q.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground rounded-xl border border-dashed p-8 text-center">
              Sin comisiones {STATUSES.find(s => s.v === tab)?.label.toLowerCase()}.
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((c) => (
                <CommissionCard
                  key={c.id}
                  c={c}
                  isAdmin={isAdmin}
                  isFinance={isFinance}
                  selectable={tab === "aprobada"}
                  selected={selected.has(c.id)}
                  onToggle={() => toggleOne(c.id)}
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
  c, isAdmin, isFinance, selectable, selected, onToggle, onApprove, onReject, onPay,
}: {
  c: CommissionRow;
  isAdmin: boolean;
  isFinance: boolean;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
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
      <div className="flex items-start gap-3">
        {selectable && (
          <Checkbox checked={selected} onCheckedChange={onToggle} className="mt-1" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
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
          <AuditHistory id={c.id} />
        </div>
      </div>
    </li>
  );
}

function AuditHistory({ id }: { id: string }) {
  const auditFn = useServerFn(getCommissionAudit);
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["commission-audit", id],
    queryFn: () => auditFn({ data: { id } }),
    enabled: open,
  });
  return (
    <details className="mt-3" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
        <History className="h-3 w-3" /> Historial
      </summary>
      <div className="mt-2 ml-2 border-l-2 border-border pl-3 space-y-2">
        {q.isLoading ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : (q.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Sin registros.</p>
        ) : (
          (q.data ?? []).map((a: CommissionAuditRow) => <AuditRow key={a.id} a={a} />)
        )}
      </div>
    </details>
  );
}

function AuditRow({ a }: { a: CommissionAuditRow }) {
  const label = a.action === "created" ? "Creada"
    : a.action === "approved" ? "Aprobada"
    : a.action === "rejected" ? "Rechazada"
    : a.action === "paid" ? "Pagada"
    : "Revertida";
  const cls = a.action === "approved" ? "text-blue-700 dark:text-blue-300"
    : a.action === "paid" ? "text-emerald-700 dark:text-emerald-300"
    : a.action === "rejected" ? "text-rose-700 dark:text-rose-300"
    : "text-muted-foreground";
  return (
    <div className="text-xs">
      <p>
        <span className={`font-semibold ${cls}`}>{label}</span>
        <span className="text-muted-foreground"> · {a.actor_label ?? "Sistema"} · {new Date(a.created_at).toLocaleString("es-CO")}</span>
      </p>
      {a.reason && <p className="text-muted-foreground">Motivo: {a.reason}</p>}
      {a.reference && <p className="text-muted-foreground">Ref: {a.reference}</p>}
    </div>
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

function BulkPayDialog({ rows, total, loading, onSubmit }: { rows: CommissionRow[]; total: number; loading: boolean; onSubmit: (ref: string | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"preview" | "confirm">("preview");
  const [ref, setRef] = useState("");
  const count = rows.length;

  const bySeller = useMemo(() => {
    const m = new Map<string, { label: string; count: number; total: number }>();
    for (const r of rows) {
      const k = r.seller_id;
      const cur = m.get(k) ?? { label: r.seller_label ?? "—", count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(r.commission_amount);
      m.set(k, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [rows]);

  const brandsCount = useMemo(() => new Set(rows.map((r) => r.brand_id)).size, [rows]);

  const reset = (o: boolean) => {
    setOpen(o);
    if (!o) { setStep("preview"); setRef(""); }
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1">
          <Send className="h-3.5 w-3.5" /> Pagar {count} comisiones ({formatMoney(total)})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {step === "preview" ? "Vista previa · pago masivo" : "Confirmar pago masivo"}
          </DialogTitle>
        </DialogHeader>

        {step === "preview" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-border bg-surface p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Comisiones</p>
                <p className="text-lg font-semibold tabular-nums">{count}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Vendedores</p>
                <p className="text-lg font-semibold tabular-nums">{bySeller.length}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Marcas</p>
                <p className="text-lg font-semibold tabular-nums">{brandsCount}</p>
              </div>
            </div>

            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 flex items-center justify-between">
              <span className="text-sm font-medium">Total a pagar</span>
              <span className="text-xl font-semibold tabular-nums">{formatMoney(total)}</span>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Desglose por vendedor</p>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Vendedor</th>
                      <th className="px-3 py-2 font-medium text-right">#</th>
                      <th className="px-3 py-2 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bySeller.map((s, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-1.5">{s.label}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{s.count}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatMoney(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Referencia común (opcional)</label>
              <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Nº lote, transferencia, banco…" />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => reset(false)}>Cancelar</Button>
              <Button onClick={() => setStep("confirm")}>Continuar</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              <p className="font-medium mb-1">¿Confirmar el pago?</p>
              <p className="text-muted-foreground">
                Vas a marcar como <span className="font-medium text-foreground">pagadas</span>{" "}
                <span className="font-medium text-foreground">{count} comisiones</span> por un total de{" "}
                <span className="font-medium text-foreground tabular-nums">{formatMoney(total)}</span>
                {ref.trim() && <> con la referencia <span className="font-medium text-foreground">"{ref.trim()}"</span></>}.
                Esta acción quedará registrada en el historial y no se puede deshacer desde aquí.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("preview")} disabled={loading}>Volver</Button>
              <Button
                disabled={loading}
                onClick={() => { onSubmit(ref.trim() || undefined); reset(false); }}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar pago masivo"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
