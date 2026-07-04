import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Loader2, Target, Plus, Trash2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { formatMoney } from "@/features/orders/order-items-editor";
import {
  listSalesGoals,
  upsertSalesGoal,
  deleteSalesGoal,
} from "@/lib/sales-goals.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/erp/finance/goals")({
  head: () => ({ meta: [{ title: "Metas de ventas — Grupo Getova" }] }),
  component: GoalsPage,
});

function firstOfMonthISO(offset: number) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - offset, 1).toISOString().slice(0, 10);
}

function GoalsPage() {
  const { brands, isAdmin } = useBrand();
  const qc = useQueryClient();
  const [monthOffset, setMonthOffset] = useState(0);
  const period = firstOfMonthISO(monthOffset);

  const listFn = useServerFn(listSalesGoals);
  const upsertFn = useServerFn(upsertSalesGoal);
  const deleteFn = useServerFn(deleteSalesGoal);

  const goalsQ = useQuery({
    queryKey: ["sales-goals", period],
    queryFn: () => listFn({ data: { periodMonth: period } }),
  });

  const sellersQ = useQuery({
    queryKey: ["sellers-list"],
    queryFn: async () => {
      const { data: sellersRoles, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["ventas", "vendedor"]);
      if (error) throw error;
      const ids = Array.from(new Set((sellersRoles ?? []).map((r) => r.user_id)));
      if (!ids.length) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .in("user_id", ids);
      return (profs ?? []).map((p) => ({
        id: p.user_id,
        label: p.display_name || p.email || "—",
      }));
    },
  });

  const upsert = useMutation({
    mutationFn: (v: { brandId: string; sellerId: string | null; amount: number }) =>
      upsertFn({ data: { ...v, periodMonth: period } }),
    onSuccess: () => {
      toast.success("Meta guardada");
      qc.invalidateQueries({ queryKey: ["sales-goals"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Meta eliminada");
      qc.invalidateQueries({ queryKey: ["sales-goals"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const monthOptions = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }).map((_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return {
        value: String(i),
        label: d.toLocaleDateString("es-CO", { month: "long", year: "numeric" }),
      };
    });
  }, []);

  const rows = goalsQ.data ?? [];
  const brandGoals = rows.filter((r) => !r.seller_id);
  const sellerGoals = rows.filter((r) => r.seller_id);

  if (!isAdmin) return <p className="text-sm text-muted-foreground">Solo el administrador.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Target className="h-4 w-4" /> Metas del mes
          </h2>
        </div>
        <div className="flex gap-2">
          <Select value={String(monthOffset)} onValueChange={(v) => setMonthOffset(Number(v))}>
            <SelectTrigger className="w-56 capitalize"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions.map((o) => (
                <SelectItem key={o.value} value={o.value} className="capitalize">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <GoalDialog
            brands={brands}
            sellers={sellersQ.data ?? []}
            onSubmit={(v) => upsert.mutate(v)}
          />
        </div>
      </div>

      {goalsQ.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <>
          <section className="space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Metas por marca</h3>
            {brandGoals.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-xl border border-dashed p-6 text-center">
                Sin metas de marca este mes.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {brandGoals.map((g) => (
                  <GoalCard key={g.id} row={g} onDelete={() => del.mutate(g.id)} />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Metas por vendedor</h3>
            {sellerGoals.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-xl border border-dashed p-6 text-center">
                Sin metas por vendedor este mes.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {sellerGoals.map((g) => (
                  <GoalCard key={g.id} row={g} onDelete={() => del.mutate(g.id)} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function GoalCard({ row, onDelete }: { row: any; onDelete: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="font-medium truncate">
            {row.brand_name}{row.seller_label ? ` · ${row.seller_label}` : " · (Global de marca)"}
          </p>
          <p className="text-xs text-muted-foreground">
            Meta: <span className="font-medium text-foreground tabular-nums">{formatMoney(row.amount)}</span>
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onDelete} className="h-7 w-7 text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Avance</span>
          <span className="tabular-nums font-medium">{formatMoney(row.achieved)} · {row.progress_pct}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full ${row.progress_pct >= 100 ? "bg-emerald-500" : "bg-primary"}`}
            style={{ width: `${Math.min(100, row.progress_pct)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function GoalDialog({
  brands,
  sellers,
  onSubmit,
}: {
  brands: { id: string; name: string }[];
  sellers: { id: string; label: string }[];
  onSubmit: (v: { brandId: string; sellerId: string | null; amount: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [brandId, setBrandId] = useState<string>("");
  const [sellerId, setSellerId] = useState<string>("_global");
  const [amount, setAmount] = useState("");

  const submit = () => {
    if (!brandId || !amount) return;
    onSubmit({
      brandId,
      sellerId: sellerId === "_global" ? null : sellerId,
      amount: Number(amount),
    });
    setOpen(false);
    setAmount("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1"><Plus className="h-3.5 w-3.5" /> Nueva meta</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Meta de ventas</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Marca</label>
            <Select value={brandId} onValueChange={setBrandId}>
              <SelectTrigger><SelectValue placeholder="Elegir marca" /></SelectTrigger>
              <SelectContent>
                {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Vendedor (opcional)</label>
            <Select value={sellerId} onValueChange={setSellerId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_global">Meta global de la marca</SelectItem>
                {sellers.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Monto (COP)</label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="250000000"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={!brandId || !amount} className="gap-1">
            <Save className="h-4 w-4" /> Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
