import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, TrendingUp, Target, Wallet, ChevronRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useBrand } from "@/features/brands/brand-context";
import {
  getDeliveryCompliance,
  getMarginCompliance,
  getWeeklyCollectionForecast,
  listAnalyticsSellers,
} from "@/lib/analytics-operations.functions";

const searchSchema = z.object({
  brand: fallback(z.string().optional(), undefined),
  seller: fallback(z.string().optional(), undefined),
  from: fallback(z.string().optional(), undefined),
  to: fallback(z.string().optional(), undefined),
});

export const Route = createFileRoute("/_authenticated/erp/analytics/operations")({
  head: () => ({ meta: [{ title: "Operación — Gráficas ERP" }] }),
  validateSearch: zodValidator(searchSchema),
  component: OperationsPage,
});

function money(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", maximumFractionDigits: 0,
  }).format(n);
}

function defaultRange() {
  const today = new Date();
  return {
    from: format(subDays(today, 30), "yyyy-MM-dd"),
    to: format(today, "yyyy-MM-dd"),
  };
}

function OperationsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { brands } = useBrand();

  const defaults = defaultRange();
  const filters = {
    brandId: search.brand ?? null,
    sellerId: search.seller ?? null,
    from: search.from ?? defaults.from,
    to: search.to ?? defaults.to,
  };

  const setFilter = (key: "brand" | "seller" | "from" | "to", value: string | undefined) => {
    navigate({ search: (prev) => ({ ...prev, [key]: value }) });
  };

  const listSellersFn = useServerFn(listAnalyticsSellers);
  const sellersQuery = useQuery({
    queryKey: ["analytics-sellers"],
    queryFn: () => listSellersFn(),
  });

  const deliveryFn = useServerFn(getDeliveryCompliance);
  const marginFn = useServerFn(getMarginCompliance);
  const collectionFn = useServerFn(getWeeklyCollectionForecast);

  const queryKey = ["analytics-ops", filters.brandId, filters.sellerId, filters.from, filters.to];
  const deliveryQuery = useQuery({
    queryKey: ["delivery", ...queryKey],
    queryFn: () => deliveryFn({ data: filters }),
  });
  const marginQuery = useQuery({
    queryKey: ["margin", ...queryKey],
    queryFn: () => marginFn({ data: filters }),
  });
  const collectionQuery = useQuery({
    queryKey: ["collection", ...queryKey],
    queryFn: () => collectionFn({ data: filters }),
  });

  const [openKpi, setOpenKpi] = useState<"delivery" | "margin" | "collection" | null>(null);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">Tableros de operación</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Indicadores clave del negocio. Solo lectura.
        </p>
      </header>

      {/* Filters bar */}
      <div className="sticky top-0 z-10 -mx-6 sm:-mx-8 px-6 sm:px-8 py-3 bg-background/80 backdrop-blur border-b border-border">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={filters.brandId ?? "__all"}
            onValueChange={(v) => setFilter("brand", v === "__all" ? undefined : v)}
          >
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue placeholder="Marca" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todas las marcas</SelectItem>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.sellerId ?? "__all"}
            onValueChange={(v) => setFilter("seller", v === "__all" ? undefined : v)}
          >
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue placeholder="Vendedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos los vendedores</SelectItem>
              {(sellersQuery.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DateRangePicker
            from={filters.from}
            to={filters.to}
            onChange={(from, to) => {
              navigate({ search: (prev) => ({ ...prev, from, to }) });
            }}
          />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ search: () => ({}) })}
            className="ml-auto"
          >
            Limpiar filtros
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <DeliveryKpiCard
          data={deliveryQuery.data}
          loading={deliveryQuery.isPending}
          onClick={() => setOpenKpi("delivery")}
        />
        <MarginKpiCard
          data={marginQuery.data}
          loading={marginQuery.isPending}
          onClick={() => setOpenKpi("margin")}
        />
        <CollectionKpiCard
          data={collectionQuery.data}
          loading={collectionQuery.isPending}
          onClick={() => setOpenKpi("collection")}
        />
      </div>

      <DeliveryDetailDialog
        open={openKpi === "delivery"}
        onOpenChange={(o) => setOpenKpi(o ? "delivery" : null)}
        data={deliveryQuery.data}
      />
      <MarginDetailDialog
        open={openKpi === "margin"}
        onOpenChange={(o) => setOpenKpi(o ? "margin" : null)}
        data={marginQuery.data}
      />
      <CollectionDetailDialog
        open={openKpi === "collection"}
        onOpenChange={(o) => setOpenKpi(o ? "collection" : null)}
        data={collectionQuery.data}
      />
    </div>
  );
}

// -------------------------------------------------------------
function DateRangePicker({
  from, to, onChange,
}: {
  from: string; to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2">
          <CalendarIcon className="h-3.5 w-3.5" />
          {format(new Date(from), "dd MMM", { locale: es })} –{" "}
          {format(new Date(to), "dd MMM yyyy", { locale: es })}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
        <Calendar
          mode="range"
          selected={{ from: new Date(from), to: new Date(to) }}
          onSelect={(r) => {
            if (r?.from && r?.to) {
              onChange(format(r.from, "yyyy-MM-dd"), format(r.to, "yyyy-MM-dd"));
              setOpen(false);
            }
          }}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  );
}

// -------------------------------------------------------------
type DeliveryData = Awaited<ReturnType<typeof getDeliveryCompliance>>;

function DeliveryKpiCard({
  data, loading, onClick,
}: { data: DeliveryData | undefined; loading: boolean; onClick: () => void }) {
  const total = data?.total ?? 0;
  const pct = total > 0 ? ((data?.onTime ?? 0) / total) * 100 : null;
  const tone = pct == null
    ? "muted"
    : pct >= 90 ? "ok" : pct >= 75 ? "warn" : "bad";
  const toneClass: Record<string, string> = {
    ok: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    bad: "text-rose-600 dark:text-rose-400",
    muted: "text-muted-foreground",
  };
  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-colors"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
          <TrendingUp className="h-3.5 w-3.5" />
          Cumplimiento de entregas
        </div>
        <CardTitle className="text-sm text-muted-foreground font-normal">
          Fecha prometida vs. real
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={cn("text-5xl font-display font-bold", toneClass[tone])}>
          {loading ? "…" : pct == null ? "—" : `${pct.toFixed(1)}%`}
        </div>
        <p className="text-xs text-muted-foreground">
          {data ? `${data.onTime} de ${total} a tiempo` : "—"}
          {data && data.pending > 0 ? ` · ${data.pending} pendientes` : ""}
        </p>
        <div className="flex items-center gap-1 text-xs text-primary">
          Ver detalle <ChevronRight className="h-3 w-3" />
        </div>
      </CardContent>
    </Card>
  );
}

function DeliveryDetailDialog({
  open, onOpenChange, data,
}: { open: boolean; onOpenChange: (o: boolean) => void; data: DeliveryData | undefined }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalle de entregas</DialogTitle>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Factura</TableHead>
              <TableHead>Prometida</TableHead>
              <TableHead>Entregada</TableHead>
              <TableHead className="text-right">Días</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.rows ?? []).map((r) => (
              <TableRow key={r.orderId} className={r.late ? "bg-rose-500/5" : ""}>
                <TableCell>{r.customerName || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r.invoiceNumber || "—"}</TableCell>
                <TableCell>{r.promisedDate}</TableCell>
                <TableCell>{r.deliveredDate}</TableCell>
                <TableCell className="text-right">
                  <Badge variant={r.late ? "destructive" : "secondary"}>
                    {r.diffDays > 0 ? `+${r.diffDays}` : r.diffDays}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {(data?.rows.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  Sin entregas en el rango seleccionado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------------------------
type MarginData = Awaited<ReturnType<typeof getMarginCompliance>>;

function MarginKpiCard({
  data, loading, onClick,
}: { data: MarginData | undefined; loading: boolean; onClick: () => void }) {
  const total = data?.total ?? 0;
  const okPct = total > 0 ? ((data?.compliant ?? 0) / total) * 100 : 0;
  const badPct = total > 0 ? 100 - okPct : 0;
  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-colors"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
          <Target className="h-3.5 w-3.5" />
          Margen ≥ 45%
        </div>
        <CardTitle className="text-sm text-muted-foreground font-normal">
          Productos por rentabilidad
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="text-5xl font-display font-bold text-muted-foreground">…</div>
        ) : (
          <div className="flex items-baseline gap-3">
            <div className="text-4xl font-display font-bold text-emerald-600 dark:text-emerald-400">
              {okPct.toFixed(0)}%
            </div>
            <div className="text-2xl font-display font-semibold text-rose-600 dark:text-rose-400">
              {badPct.toFixed(0)}%
            </div>
          </div>
        )}
        <div className="h-2.5 w-full rounded-full overflow-hidden bg-muted flex">
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: `${okPct}%` }}
          />
          <div
            className="bg-rose-500 transition-all"
            style={{ width: `${badPct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {data ? `${data.compliant} cumplen · ${data.nonCompliant} no cumplen` : "—"}
          {data && data.noCost > 0 ? ` · ${data.noCost} sin costo` : ""}
        </p>
        <div className="flex items-center gap-1 text-xs text-primary">
          Ver productos por debajo <ChevronRight className="h-3 w-3" />
        </div>
      </CardContent>
    </Card>
  );
}

function MarginDetailDialog({
  open, onOpenChange, data,
}: { open: boolean; onOpenChange: (o: boolean) => void; data: MarginData | undefined }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Productos por debajo del margen mínimo (45%)</DialogTitle>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>Factura</TableHead>
              <TableHead className="text-right">Venta</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-right">Margen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.rows ?? []).map((r) => (
              <TableRow key={r.itemId}>
                <TableCell className="max-w-xs truncate">{r.description}</TableCell>
                <TableCell className="font-mono text-xs">{r.invoiceNumber || "—"}</TableCell>
                <TableCell className="text-right">{money(r.sale)}</TableCell>
                <TableCell className="text-right">{money(r.cost)}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="destructive">{r.marginPct.toFixed(1)}%</Badge>
                </TableCell>
              </TableRow>
            ))}
            {(data?.rows.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  Todos los productos cumplen el margen mínimo. 🎉
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {data && data.noCost > 0 && (
          <p className="text-xs text-muted-foreground mt-3">
            {data.noCost} producto(s) sin costo registrado no se incluyen en el cálculo.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------------------------
type CollectionData = Awaited<ReturnType<typeof getWeeklyCollectionForecast>>;

function CollectionKpiCard({
  data, loading, onClick,
}: { data: CollectionData | undefined; loading: boolean; onClick: () => void }) {
  const current = useMemo(() => {
    if (!data) return null;
    return data.weeks.find((w) => w.weekKey === data.currentWeekKey) ?? null;
  }, [data]);

  const projectedTotal = current?.projectedTotal ?? 0;
  const carryIn = current?.carryIn ?? 0;
  const projectedNew = current?.projectedNew ?? 0;
  const carryPct = projectedTotal > 0 ? (carryIn / projectedTotal) * 100 : 0;

  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-colors"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
          <Wallet className="h-3.5 w-3.5" />
          Recaudo semanal proyectado
        </div>
        <CardTitle className="text-sm text-muted-foreground font-normal">
          Semana actual{current ? ` · ${current.weekStart} → ${current.weekEnd}` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-4xl font-display font-bold">
          {loading ? "…" : money(projectedTotal)}
        </div>
        {carryIn > 0 && (
          <Badge variant="destructive" className="gap-1">
            Rezago: {money(carryIn)} · {carryPct.toFixed(0)}%
          </Badge>
        )}
        <div className="h-2.5 w-full rounded-full overflow-hidden bg-muted flex">
          <div
            className="bg-primary transition-all"
            style={{ width: projectedTotal > 0 ? `${(projectedNew / projectedTotal) * 100}%` : "0%" }}
          />
          <div
            className="bg-rose-500 transition-all"
            style={{ width: `${carryPct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Nuevo: {money(projectedNew)} · Rezago: {money(carryIn)}
        </p>
        <div className="flex items-center gap-1 text-xs text-primary">
          Ver semana por semana <ChevronRight className="h-3 w-3" />
        </div>
      </CardContent>
    </Card>
  );
}

function CollectionDetailDialog({
  open, onOpenChange, data,
}: { open: boolean; onOpenChange: (o: boolean) => void; data: CollectionData | undefined }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Recaudo proyectado semana a semana</DialogTitle>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHead>Semana</TableHead>
              <TableHead className="text-right">Nuevo</TableHead>
              <TableHead className="text-right">Rezago in</TableHead>
              <TableHead className="text-right">Proyectado</TableHead>
              <TableHead className="text-right">Recaudado</TableHead>
              <TableHead className="text-right">Rezago out</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.weeks ?? []).map((w) => {
              const isOpen = expanded === w.weekKey;
              const isCurrent = w.weekKey === data?.currentWeekKey;
              return (
                <>
                  <TableRow
                    key={w.weekKey}
                    className={cn("cursor-pointer", isCurrent && "bg-primary/5")}
                    onClick={() => setExpanded(isOpen ? null : w.weekKey)}
                  >
                    <TableCell className="w-8">
                      <ChevronRight
                        className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {w.weekStart} → {w.weekEnd}
                      {isCurrent && <Badge variant="outline" className="ml-2">Actual</Badge>}
                    </TableCell>
                    <TableCell className="text-right">{money(w.projectedNew)}</TableCell>
                    <TableCell className="text-right text-rose-600 dark:text-rose-400">
                      {w.carryIn > 0 ? money(w.carryIn) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{money(w.projectedTotal)}</TableCell>
                    <TableCell className="text-right text-emerald-600 dark:text-emerald-400">
                      {money(w.collected)}
                    </TableCell>
                    <TableCell className="text-right">
                      {w.carryOut > 0 ? money(w.carryOut) : "—"}
                    </TableCell>
                  </TableRow>
                  {isOpen && (w.newInvoices.length > 0 || w.carryInvoices.length > 0) && (
                    <TableRow key={`${w.weekKey}-detail`} className="bg-muted/30">
                      <TableCell colSpan={7} className="p-4">
                        <InvoicesBreakdown
                          title="Nuevas esta semana"
                          invoices={w.newInvoices}
                        />
                        {w.carryInvoices.length > 0 && (
                          <div className="mt-4">
                            <InvoicesBreakdown
                              title="Rezagadas de semanas anteriores"
                              invoices={w.carryInvoices}
                            />
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
            {(data?.weeks.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                  Sin proyecciones en el rango seleccionado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}

function InvoicesBreakdown({
  title, invoices,
}: {
  title: string;
  invoices: { orderId: string; invoiceNumber: string | null; customerName: string | null; balance: number; promisedDate: string }[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Factura</TableHead>
            <TableHead>Prometida</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((inv) => (
            <TableRow key={inv.orderId}>
              <TableCell>{inv.customerName || "—"}</TableCell>
              <TableCell className="font-mono text-xs">{inv.invoiceNumber || "—"}</TableCell>
              <TableCell>{inv.promisedDate}</TableCell>
              <TableCell className="text-right">{money(inv.balance)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
