import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, PackagePlus, PackageMinus, Boxes, Search, X } from "lucide-react";
import { toast } from "sonner";

import {
  listZoneSummary,
  listZoneContents,
  listItemsAvailableForIntake,
  listItemsInWarehouse,
  registerWarehouseMovement,
} from "@/lib/warehouse.functions";
import { useWarehouseRealtime } from "@/features/warehouse/use-warehouse-realtime";
import { useBrand } from "@/features/brands/brand-context";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/erp/warehouse")({
  head: () => ({ meta: [{ title: "Bodega — ERP" }] }),
  component: WarehousePage,
});

function WarehousePage() {
  useWarehouseRealtime();
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Boxes className="h-5 w-5" /> Control de bodega
        </h1>
        <p className="text-sm text-muted-foreground">
          Registra ingresos y salidas de productos por zona.
        </p>
      </header>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Resumen por zona</TabsTrigger>
          <TabsTrigger value="intake">Ingreso</TabsTrigger>
          <TabsTrigger value="dispatch">Salida</TabsTrigger>
        </TabsList>
        <TabsContent value="summary" className="mt-4"><ZoneSummary /></TabsContent>
        <TabsContent value="intake" className="mt-4"><IntakeForm /></TabsContent>
        <TabsContent value="dispatch" className="mt-4"><DispatchForm /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zone summary
// ---------------------------------------------------------------------------
function ZoneSummary() {
  const fn = useServerFn(listZoneSummary);
  const q = useQuery({
    queryKey: ["warehouse", "zone-summary"],
    queryFn: () => fn(),
  });

  if (q.isLoading)
    return <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" /></div>;
  if (q.error) return <p className="text-sm text-rose-600">{(q.error as Error).message}</p>;
  const zones = (q.data ?? []).filter((z: any) => z.active && z.warehouse?.active);
  if (zones.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <Boxes className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-medium">Aún no hay zonas activas</p>
        <p className="text-xs text-muted-foreground mt-1">
          Pídele a un administrador que cree bodegas y zonas en Ajustes → Bodegas.
        </p>
      </div>
    );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {zones.map((z: any) => (
        <ZoneCard key={z.id} zone={z} />
      ))}
    </div>
  );
}

function ZoneCard({ zone }: { zone: any }) {
  const [open, setOpen] = useState(false);
  const pct = zone.capacity_units && zone.capacity_units > 0
    ? Math.min(100, Math.round((zone.current_count / zone.capacity_units) * 100))
    : null;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="text-left rounded-xl border border-border bg-surface p-4 hover:border-primary/50 transition-colors">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-sm font-semibold">{zone.zone_code}</p>
              <p className="text-xs text-muted-foreground truncate">{zone.warehouse?.name}</p>
              {zone.description && <p className="text-xs mt-1 line-clamp-2">{zone.description}</p>}
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold leading-tight">{zone.current_count}</p>
              <p className="text-[10px] uppercase text-muted-foreground">productos</p>
            </div>
          </div>
          {pct !== null && (
            <div className="mt-3">
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {zone.current_count} / {zone.capacity_units} ({pct}%)
              </p>
            </div>
          )}
        </button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Zona {zone.zone_code}</SheetTitle>
        </SheetHeader>
        {open && <ZoneContents zoneId={zone.id} />}
      </SheetContent>
    </Sheet>
  );
}

function ZoneContents({ zoneId }: { zoneId: string }) {
  const fn = useServerFn(listZoneContents);
  const q = useQuery({
    queryKey: ["warehouse", "zone-contents", zoneId],
    queryFn: () => fn({ data: { zoneId } }),
  });
  if (q.isLoading) return <div className="py-6 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>;
  const items = q.data ?? [];
  if (items.length === 0) return <p className="text-sm text-muted-foreground mt-4">Esta zona está vacía.</p>;
  return (
    <div className="mt-4 space-y-2">
      {items.map((it: any) => (
        <div key={it.id} className="rounded-lg border border-border p-3">
          <p className="text-sm font-medium line-clamp-2">{it.description || "Producto"}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {it.order?.customer_name ?? "—"}
            {it.order?.order_number && <> · {it.order.order_number}</>}
            {it.order?.invoice_number && <> · Fact. {it.order.invoice_number}</>}
          </p>
          {it.last_movement_at && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Ingreso: {new Date(it.last_movement_at).toLocaleString("es-CO")}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intake form
// ---------------------------------------------------------------------------
function IntakeForm() {
  const { selectedBrandId } = useBrand();
  const qc = useQueryClient();
  const listFn = useServerFn(listItemsAvailableForIntake);
  const summaryFn = useServerFn(listZoneSummary);
  const registerFn = useServerFn(registerWarehouseMovement);

  const [search, setSearch] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState("");
  const [reason, setReason] = useState("");
  const [movedAt, setMovedAt] = useState(() => new Date().toISOString().slice(0, 10));

  const itemsQ = useQuery({
    queryKey: ["warehouse", "available-items", selectedBrandId, search],
    queryFn: () => listFn({ data: { search, brandId: selectedBrandId ?? undefined } }),
  });
  const zonesQ = useQuery({
    queryKey: ["warehouse", "zone-summary"],
    queryFn: () => summaryFn(),
  });
  const activeZones = useMemo(
    () => (zonesQ.data ?? []).filter((z: any) => z.active && z.warehouse?.active),
    [zonesQ.data],
  );

  const selected = (itemsQ.data ?? []).find((i: any) => i.id === selectedItemId);

  const submit = useMutation({
    mutationFn: async () => {
      if (!selectedItemId) throw new Error("Selecciona un producto");
      if (!zoneId) throw new Error("Selecciona una zona");
      return registerFn({
        data: {
          itemId: selectedItemId,
          zoneId,
          movementType: "in",
          movedAt: new Date(movedAt + "T00:00:00").toISOString(),
          reason: reason || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Ingreso registrado");
      setSelectedItemId(null);
      setZoneId("");
      setReason("");
      qc.invalidateQueries({ queryKey: ["warehouse"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al registrar ingreso"),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><PackagePlus className="h-4 w-4" /> Buscar producto</h3>
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Cliente, factura, descripción…" className="pl-9" />
        </div>
        <p className="text-[11px] text-muted-foreground">Solo aparecen productos con producción terminada que no están en bodega.</p>
        <div className="max-h-96 overflow-y-auto space-y-1.5">
          {itemsQ.isLoading ? <Loader2 className="h-4 w-4 animate-spin inline" /> :
            (itemsQ.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground py-4">Sin resultados.</p>
            ) : (itemsQ.data ?? []).map((it: any) => (
              <button key={it.id} onClick={() => setSelectedItemId(it.id)}
                className={`w-full text-left rounded-lg border p-2 transition-colors ${
                  selectedItemId === it.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}>
                <p className="text-sm font-medium line-clamp-1">{it.description || "Producto"}</p>
                <p className="text-[11px] text-muted-foreground">
                  {it.order?.customer_name ?? "—"}
                  {it.order?.order_number && <> · {it.order.order_number}</>}
                  {it.order?.invoice_number && <> · Fact. {it.order.invoice_number}</>}
                </p>
              </button>
            ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <h3 className="text-sm font-semibold">Detalles del ingreso</h3>
        {selected ? (
          <div className="rounded-lg bg-muted/40 p-2 flex items-start justify-between gap-2">
            <div className="min-w-0 text-sm">
              <p className="font-medium line-clamp-1">{selected.description}</p>
              <p className="text-[11px] text-muted-foreground">
                {selected.order?.customer_name} · {selected.order?.order_number}
              </p>
            </div>
            <button onClick={() => setSelectedItemId(null)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Selecciona un producto a la izquierda.</p>
        )}

        <div>
          <Label>Zona destino</Label>
          <Select value={zoneId} onValueChange={setZoneId}>
            <SelectTrigger><SelectValue placeholder="Selecciona zona" /></SelectTrigger>
            <SelectContent>
              {activeZones.length === 0 && (
                <div className="px-2 py-3 text-xs text-muted-foreground">No hay zonas activas.</div>
              )}
              {activeZones.map((z: any) => (
                <SelectItem key={z.id} value={z.id}>
                  {z.zone_code} — {z.warehouse?.name}
                  {z.capacity_units ? ` (${z.current_count}/${z.capacity_units})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Fecha</Label>
          <Input type="date" value={movedAt} onChange={(e) => setMovedAt(e.target.value)} />
        </div>

        <div>
          <Label>Motivo (opcional)</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            placeholder="Ej: recepción de proveedor, devolución del cliente…" />
        </div>

        <Button onClick={() => submit.mutate()} disabled={submit.isPending || !selectedItemId || !zoneId} className="w-full">
          {submit.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Registrar ingreso
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dispatch form
// ---------------------------------------------------------------------------
function DispatchForm() {
  const qc = useQueryClient();
  const listFn = useServerFn(listItemsInWarehouse);
  const registerFn = useServerFn(registerWarehouseMovement);

  const [search, setSearch] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [reason, setReason] = useState("entrega_cliente");
  const [reasonText, setReasonText] = useState("");
  const [clientInvoice, setClientInvoice] = useState("");
  const [clientCedula, setClientCedula] = useState("");
  const [movedAt, setMovedAt] = useState(() => new Date().toISOString().slice(0, 10));

  const itemsQ = useQuery({
    queryKey: ["warehouse", "in-warehouse", search],
    queryFn: () => listFn({ data: { search } }),
  });
  const selected = (itemsQ.data ?? []).find((i: any) => i.id === selectedItemId);

  const submit = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Selecciona un producto");
      const composed = reason === "entrega_cliente"
        ? `Entrega cliente${reasonText ? " — " + reasonText : ""}`
        : reason === "traslado"
          ? `Traslado${reasonText ? " — " + reasonText : ""}`
          : (reasonText || "Salida");
      return registerFn({
        data: {
          itemId: selected.id,
          zoneId: selected.zone_id,
          movementType: "out",
          movedAt: new Date(movedAt + "T00:00:00").toISOString(),
          reason: composed,
          clientInvoice: reason === "entrega_cliente" ? clientInvoice || undefined : undefined,
          clientCedula: reason === "entrega_cliente" ? clientCedula || undefined : undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Salida registrada");
      setSelectedItemId(null);
      setReasonText("");
      setClientInvoice("");
      setClientCedula("");
      qc.invalidateQueries({ queryKey: ["warehouse"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al registrar salida"),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><PackageMinus className="h-4 w-4" /> Productos en bodega</h3>
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Cliente, factura, descripción…" className="pl-9" />
        </div>
        <div className="max-h-96 overflow-y-auto space-y-1.5">
          {itemsQ.isLoading ? <Loader2 className="h-4 w-4 animate-spin inline" /> :
            (itemsQ.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground py-4">No hay productos en bodega.</p>
            ) : (itemsQ.data ?? []).map((it: any) => (
              <button key={it.id} onClick={() => setSelectedItemId(it.id)}
                className={`w-full text-left rounded-lg border p-2 transition-colors ${
                  selectedItemId === it.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}>
                <p className="text-sm font-medium line-clamp-1">{it.description || "Producto"}</p>
                <p className="text-[11px] text-muted-foreground">
                  {it.order?.customer_name ?? "—"}
                  {it.order?.order_number && <> · {it.order.order_number}</>}
                  {it.order?.invoice_number && <> · Fact. {it.order.invoice_number}</>}
                </p>
              </button>
            ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <h3 className="text-sm font-semibold">Detalles de la salida</h3>
        {selected ? (
          <div className="rounded-lg bg-muted/40 p-2 flex items-start justify-between gap-2">
            <div className="min-w-0 text-sm">
              <p className="font-medium line-clamp-1">{selected.description}</p>
              <p className="text-[11px] text-muted-foreground">{selected.order?.customer_name}</p>
            </div>
            <button onClick={() => setSelectedItemId(null)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Selecciona un producto a la izquierda.</p>
        )}

        <div>
          <Label>Motivo</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="entrega_cliente">Entrega a cliente</SelectItem>
              <SelectItem value="traslado">Traslado</SelectItem>
              <SelectItem value="otro">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {reason === "entrega_cliente" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Factura cliente</Label>
              <Input value={clientInvoice} onChange={(e) => setClientInvoice(e.target.value)} />
            </div>
            <div>
              <Label>Cédula cliente</Label>
              <Input value={clientCedula} onChange={(e) => setClientCedula(e.target.value)} />
            </div>
          </div>
        )}

        <div>
          <Label>Fecha</Label>
          <Input type="date" value={movedAt} onChange={(e) => setMovedAt(e.target.value)} />
        </div>

        <div>
          <Label>Nota (opcional)</Label>
          <Textarea value={reasonText} onChange={(e) => setReasonText(e.target.value)} rows={2} />
        </div>

        <Button onClick={() => submit.mutate()} disabled={submit.isPending || !selected} className="w-full" variant="default">
          {submit.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Registrar salida
        </Button>
      </div>
    </div>
  );
}
