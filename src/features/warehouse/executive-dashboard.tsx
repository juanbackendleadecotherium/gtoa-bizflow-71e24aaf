import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, AlertTriangle, Clock, Settings2, Boxes, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { listExecutiveDashboard, listAllSuppliersLite } from "@/lib/warehouse.functions";
import {
  getWarehouseSettings,
  updateStagnantThreshold,
} from "@/lib/warehouse-settings.functions";
import { useBrand } from "@/features/brands/brand-context";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";

export function ExecutiveDashboard() {
  const { brands, selectedBrandId, isAdmin } = useBrand();
  const qc = useQueryClient();

  // Realtime: refresh settings when the threshold changes
  useEffect(() => {
    const ch = supabase
      .channel("warehouse-settings-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "warehouse_settings" },
        () => qc.invalidateQueries({ queryKey: ["warehouse-settings"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const settingsFn = useServerFn(getWarehouseSettings);
  const settingsQ = useQuery({
    queryKey: ["warehouse-settings"],
    queryFn: () => settingsFn(),
  });
  const threshold = settingsQ.data?.stagnant_days_threshold ?? 15;

  const dashFn = useServerFn(listExecutiveDashboard);
  const dashQ = useQuery({
    queryKey: ["warehouse", "exec-dashboard", brandFilter, supplierFilter, fromDate, toDate],
    queryFn: () => dashFn({
      data: {
        brandId: brandFilter !== "all" ? brandFilter : undefined,
        supplierId: supplierFilter !== "all" ? supplierFilter : undefined,
        fromDate: fromDate ? new Date(fromDate + "T00:00:00").toISOString() : undefined,
        toDate: toDate ? new Date(toDate + "T23:59:59").toISOString() : undefined,
      },
    }),
  });

  const suppliersFn = useServerFn(listAllSuppliersLite);
  const suppliersQ = useQuery({
    queryKey: ["warehouse", "suppliers-lite"],
    queryFn: () => suppliersFn(),
  });
  const suppliers = useMemo(() => {
    const all = suppliersQ.data ?? [];
    if (brandFilter === "all") return all;
    return all.filter((s: any) => s.brand_id === brandFilter || !s.brand_id);
  }, [suppliersQ.data, brandFilter]);

  const visibleBrands = useMemo(() => brands ?? [], [brands]);

  // sync to selected brand from header when user hasn't overridden
  useEffect(() => {
    if (brandFilter === "all" && selectedBrandId) {
      // keep as 'all' by default; user can pick to narrow
    }
  }, [selectedBrandId, brandFilter]);

  const zones = dashQ.data ?? [];
  const totalItems = zones.reduce((s: number, z: any) => s + z.item_count, 0);
  const stagnantCount = zones.reduce(
    (s: number, z: any) => s + z.items.filter((it: any) => it.days_in_warehouse > threshold).length,
    0,
  );

  const clearFilters = () => {
    setBrandFilter("all"); setSupplierFilter("all"); setFromDate(""); setToDate("");
  };

  return (
    <div className="space-y-4">
      <ThresholdBanner
        threshold={threshold}
        isAdmin={isAdmin}
        loading={settingsQ.isLoading}
        stagnantCount={stagnantCount}
      />

      {/* Filters */}
      <div className="rounded-xl border border-border bg-surface p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Marca</Label>
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las marcas</SelectItem>
              {visibleBrands.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Proveedor</Label>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {suppliers.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Desde (ingreso)</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Hasta (ingreso)</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <div className="md:col-span-2 lg:col-span-4 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {totalItems} {totalItems === 1 ? "producto" : "productos"} en bodega ·{" "}
            {stagnantCount > 0 && (
              <span className="text-rose-600 font-medium">
                {stagnantCount} estancados (&gt; {threshold} días)
              </span>
            )}
          </p>
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-3 w-3 mr-1" /> Limpiar
          </Button>
        </div>
      </div>

      {dashQ.isLoading ? (
        <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" /></div>
      ) : zones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Boxes className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">Sin zonas activas para los filtros aplicados</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {zones.map((z: any) => (
            <ZoneDashboardCard key={z.id} zone={z} threshold={threshold} />
          ))}
        </div>
      )}
    </div>
  );
}

function ThresholdBanner({
  threshold, isAdmin, loading, stagnantCount,
}: { threshold: number; isAdmin: boolean; loading: boolean; stagnantCount: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Clock className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-xs uppercase text-muted-foreground">Umbral de alerta</p>
          <p className="text-sm font-medium">
            Productos con más de <span className="font-semibold">{loading ? "…" : threshold}</span> días en bodega se marcan como estancados
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {stagnantCount > 0 && (
          <Badge className="bg-rose-600 hover:bg-rose-600 text-white">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {stagnantCount} estancado{stagnantCount === 1 ? "" : "s"}
          </Badge>
        )}
        {isAdmin && <EditThresholdDialog currentValue={threshold} />}
      </div>
    </div>
  );
}

function EditThresholdDialog({ currentValue }: { currentValue: number }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(currentValue));
  const qc = useQueryClient();
  const fn = useServerFn(updateStagnantThreshold);

  useEffect(() => { setValue(String(currentValue)); }, [currentValue, open]);

  const mut = useMutation({
    mutationFn: () => fn({ data: { days: Number(value) } }),
    onSuccess: () => {
      toast.success("Umbral actualizado");
      qc.invalidateQueries({ queryKey: ["warehouse-settings"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="h-3 w-3 mr-1" /> Editar umbral
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Días para considerar producto estancado</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs">Días</Label>
          <Input
            type="number" min={1} max={365}
            value={value} onChange={(e) => setValue(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Cualquier producto que lleve más de N días desde su último ingreso se marcará en rojo.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !Number(value) || Number(value) < 1}
          >
            {mut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ZoneDashboardCard({ zone, threshold }: { zone: any; threshold: number }) {
  const [open, setOpen] = useState(false);
  const stagnant = zone.items.filter((it: any) => it.days_in_warehouse > threshold).length;
  const warning = zone.items.filter(
    (it: any) => it.days_in_warehouse > threshold - 3 && it.days_in_warehouse <= threshold,
  ).length;

  // unique invoices + cedulas
  const invoices = Array.from(new Set(
    zone.items.map((it: any) => it.invoice_number || it.order_number).filter(Boolean),
  )).slice(0, 4);
  const cedulas = Array.from(new Set(
    zone.items.map((it: any) => it.customer_doc_number).filter(Boolean),
  )).slice(0, 4);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="text-left rounded-xl border border-border bg-surface p-4 hover:border-primary/50 transition-colors w-full">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-sm font-semibold">{zone.zone_code}</p>
              <p className="text-xs text-muted-foreground truncate">{zone.warehouse?.name}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold leading-tight">{zone.item_count}</p>
              <p className="text-[10px] uppercase text-muted-foreground">productos</p>
            </div>
          </div>

          {(stagnant > 0 || warning > 0) && (
            <div className="mt-3 flex gap-2 flex-wrap">
              {stagnant > 0 && (
                <Badge className="bg-rose-600 hover:bg-rose-600 text-white text-[10px]">
                  <AlertTriangle className="h-3 w-3 mr-1" /> {stagnant} estancado{stagnant === 1 ? "" : "s"}
                </Badge>
              )}
              {warning > 0 && (
                <Badge className="bg-orange-500 hover:bg-orange-500 text-white text-[10px]">
                  {warning} próximo{warning === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
          )}

          <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
            <p className="font-medium text-foreground/80 uppercase text-[9px]">Cuentas de cobro</p>
            <p className="truncate">{invoices.length ? invoices.join(", ") : "—"}</p>
            <p className="font-medium text-foreground/80 uppercase text-[9px] mt-1">Cédulas</p>
            <p className="truncate">{cedulas.length ? cedulas.join(", ") : "—"}</p>
            <p className="font-medium text-foreground/80 uppercase text-[9px] mt-1">Máx. días en bodega</p>
            <p className={zone.max_days > threshold ? "text-rose-600 font-semibold" : ""}>
              {zone.max_days} días
            </p>
          </div>
        </button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Zona {zone.zone_code} · {zone.item_count} productos</SheetTitle>
        </SheetHeader>
        <ZoneDetailList items={zone.items} threshold={threshold} />
      </SheetContent>
    </Sheet>
  );
}

function ZoneDetailList({ items, threshold }: { items: any[]; threshold: number }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground mt-4">Esta zona está vacía.</p>;
  }
  const sorted = [...items].sort((a, b) => b.days_in_warehouse - a.days_in_warehouse);
  return (
    <div className="mt-4 space-y-2">
      {sorted.map((it) => {
        const stagnant = it.days_in_warehouse > threshold;
        const warning = !stagnant && it.days_in_warehouse > threshold - 3;
        return (
          <div
            key={it.id}
            className={`rounded-lg border p-3 ${
              stagnant ? "border-rose-500 bg-rose-50/40 dark:bg-rose-950/20"
              : warning ? "border-orange-400 bg-orange-50/40 dark:bg-orange-950/20"
              : "border-border"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium line-clamp-2 flex-1">
                {it.description || "Producto"}
              </p>
              <Badge
                variant={stagnant ? "destructive" : warning ? "default" : "secondary"}
                className={`whitespace-nowrap text-[10px] ${
                  warning && !stagnant ? "bg-orange-500 hover:bg-orange-500 text-white" : ""
                }`}
              >
                {it.days_in_warehouse} días
              </Badge>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              <p><span className="text-foreground/70">Cuenta de cobro:</span> {it.invoice_number || it.order_number || "—"}</p>
              <p><span className="text-foreground/70">Cédula:</span> {it.customer_doc_number || "—"}</p>
              <p className="col-span-2 truncate"><span className="text-foreground/70">Cliente:</span> {it.customer_name || "—"}</p>
              {it.supplier_name && (
                <p className="col-span-2 truncate"><span className="text-foreground/70">Proveedor:</span> {it.supplier_name}</p>
              )}
              {it.last_movement_at && (
                <p className="col-span-2"><span className="text-foreground/70">Ingreso:</span> {new Date(it.last_movement_at).toLocaleDateString("es-CO")}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
