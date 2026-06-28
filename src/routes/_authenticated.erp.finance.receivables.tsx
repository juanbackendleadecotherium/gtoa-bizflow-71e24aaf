import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, Download, ExternalLink, Search } from "lucide-react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/features/orders/order-items-editor";

export const Route = createFileRoute("/_authenticated/erp/finance/receivables")({
  component: Receivables,
});

type Row = {
  order_id: string;
  order_number: string;
  invoice_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  created_at: string;
  total: number;
  paid_total: number;
  balance: number;
  payment_status: "pagada" | "abono" | "sin_abono";
  days_since_sale: number;
  seller_label: string;
};

function ageBucket(days: number) {
  if (days <= 30) return "0–30";
  if (days <= 60) return "31–60";
  if (days <= 90) return "61–90";
  return "90+";
}
function ageColor(b: string) {
  if (b === "0–30") return "text-emerald-700 dark:text-emerald-400";
  if (b === "31–60") return "text-amber-700 dark:text-amber-400";
  if (b === "61–90") return "text-orange-700 dark:text-orange-400";
  return "text-rose-700 dark:text-rose-400";
}

function Receivables() {
  const { selectedBrandId } = useBrand();
  const [search, setSearch] = useState("");
  const [bucket, setBucket] = useState<"all" | "0–30" | "31–60" | "61–90" | "90+">("all");

  const q = useQuery({
    queryKey: ["finance-receivables", selectedBrandId],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_financials")
        .select("order_id, order_number, invoice_number, customer_name, customer_phone, customer_email, created_at, total, paid_total, balance, payment_status, days_since_sale, seller_label")
        .eq("brand_id", selectedBrandId!)
        .gt("balance", 0)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const filtered = useMemo(() => {
    const rows = q.data ?? [];
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (bucket !== "all" && ageBucket(r.days_since_sale) !== bucket) return false;
      if (!s) return true;
      return (
        (r.customer_name || "").toLowerCase().includes(s) ||
        (r.invoice_number || "").toLowerCase().includes(s) ||
        (r.order_number || "").toLowerCase().includes(s) ||
        (r.customer_phone || "").toLowerCase().includes(s)
      );
    });
  }, [q.data, search, bucket]);

  const totals = useMemo(() => {
    const buckets = { "0–30": 0, "31–60": 0, "61–90": 0, "90+": 0 } as Record<string, number>;
    let total = 0;
    for (const r of q.data ?? []) {
      const b = ageBucket(r.days_since_sale);
      buckets[b] += Number(r.balance);
      total += Number(r.balance);
    }
    return { buckets, total };
  }, [q.data]);

  const exportCSV = () => {
    const csv = Papa.unparse(
      filtered.map((r) => ({
        "Cuenta de cobro": r.invoice_number || r.order_number,
        Cliente: r.customer_name || "",
        Telefono: r.customer_phone || "",
        Email: r.customer_email || "",
        Vendedor: r.seller_label,
        Fecha: new Date(r.created_at).toLocaleDateString("es-CO"),
        Dias: r.days_since_sale,
        Total: r.total,
        Pagado: r.paid_total,
        Saldo: r.balance,
      })),
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `cartera-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (q.isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tile label="Cartera total" value={formatMoney(totals.total)} accent="text-foreground" big />
        {(["0–30", "31–60", "61–90", "90+"] as const).map((b) => (
          <Tile key={b} label={`${b} días`} value={formatMoney(totals.buckets[b])} accent={ageColor(b)} />
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente, cuenta de cobro, teléfono…" className="pl-9" />
          </div>
          <Select value={bucket} onValueChange={(v: any) => setBucket(v)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las edades</SelectItem>
              <SelectItem value="0–30">0–30 días</SelectItem>
              <SelectItem value="31–60">31–60 días</SelectItem>
              <SelectItem value="61–90">61–90 días</SelectItem>
              <SelectItem value="90+">90+ días</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="h-3.5 w-3.5" />Exportar CSV
          </Button>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Sin cuentas de cobro pendientes con estos filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Cuenta de cobro</th>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Vendedor</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2 pr-3 text-right">Pagado</th>
                  <th className="py-2 pr-3 text-right">Saldo</th>
                  <th className="py-2 pr-3 text-right">Días</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const b = ageBucket(r.days_since_sale);
                  return (
                    <tr key={r.order_id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 font-medium">{r.invoice_number ?? r.order_number}</td>
                      <td className="py-2 pr-3">
                        <p>{r.customer_name ?? "—"}</p>
                        {r.customer_phone && <p className="text-xs text-muted-foreground">{r.customer_phone}</p>}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{r.seller_label}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(r.total)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatMoney(r.paid_total)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums font-semibold text-amber-700 dark:text-amber-400">{formatMoney(r.balance)}</td>
                      <td className={`py-2 pr-3 text-right tabular-nums text-xs ${ageColor(b)}`}>{r.days_since_sale}d</td>
                      <td className="py-2">
                        <Link to="/erp/orders/$id" params={{ id: r.order_id }} className="inline-flex items-center gap-1 text-primary hover:underline text-xs">
                          Abrir<ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, accent, big }: { label: string; value: string; accent?: string; big?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`${big ? "font-display text-xl" : "text-base"} font-semibold mt-1 tabular-nums ${accent ?? ""}`}>{value}</p>
    </div>
  );
}
