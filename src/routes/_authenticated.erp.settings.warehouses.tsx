import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Pencil, Trash2, Building2, Boxes } from "lucide-react";
import { toast } from "sonner";

import {
  listWarehousesWithZones,
  upsertWarehouse,
  upsertWarehouseZone,
  deleteWarehouseZone,
  deleteWarehouse,
} from "@/lib/warehouse.functions";
import { useWarehouseRealtime } from "@/features/warehouse/use-warehouse-realtime";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/erp/settings/warehouses")({
  head: () => ({ meta: [{ title: "Bodegas y zonas — Ajustes" }] }),
  component: WarehousesSettings,
});

function WarehousesSettings() {
  useWarehouseRealtime();
  const listFn = useServerFn(listWarehousesWithZones);
  const q = useQuery({
    queryKey: ["warehouse", "admin", "list"],
    queryFn: () => listFn(),
  });

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Bodegas y zonas
          </h1>
          <p className="text-sm text-muted-foreground">
            Crea bodegas y zonas. Define los códigos cuando los tengas listos.
          </p>
        </div>
        <WarehouseDialog>
          <Button><Plus className="h-4 w-4 mr-1" /> Nueva bodega</Button>
        </WarehouseDialog>
      </header>

      {q.isLoading ? (
        <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" /></div>
      ) : (q.data ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">Aún no hay bodegas</p>
          <p className="text-xs text-muted-foreground mt-1">Crea la primera para empezar a registrar zonas.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {(q.data ?? []).map((w: any) => <WarehouseCard key={w.id} warehouse={w} />)}
        </div>
      )}
    </div>
  );
}

function WarehouseCard({ warehouse }: { warehouse: any }) {
  const qc = useQueryClient();
  const delFn = useServerFn(deleteWarehouse);
  const del = useMutation({
    mutationFn: () => delFn({ data: { id: warehouse.id } }),
    onSuccess: () => { toast.success("Bodega eliminada"); qc.invalidateQueries({ queryKey: ["warehouse"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold">{warehouse.name}</p>
            {!warehouse.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">inactiva</span>}
          </div>
          {warehouse.address && <p className="text-xs text-muted-foreground mt-1">{warehouse.address}</p>}
        </div>
        <div className="flex gap-2">
          <WarehouseDialog warehouse={warehouse}>
            <Button variant="outline" size="sm"><Pencil className="h-3.5 w-3.5" /></Button>
          </WarehouseDialog>
          <Button variant="outline" size="sm" onClick={() => {
            if (confirm("¿Eliminar bodega? Solo se permite si no tiene zonas.")) del.mutate();
          }}><Trash2 className="h-3.5 w-3.5 text-rose-600" /></Button>
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <Boxes className="h-3 w-3" /> Zonas
          </p>
          <ZoneDialog warehouseId={warehouse.id}>
            <Button variant="outline" size="sm"><Plus className="h-3.5 w-3.5 mr-1" /> Nueva zona</Button>
          </ZoneDialog>
        </div>
        {(warehouse.zones ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-3">
            Aún no hay zonas. Crea la primera cuando tengas los códigos definidos.
          </p>
        ) : (
          <div className="space-y-1.5">
            {warehouse.zones.map((z: any) => <ZoneRow key={z.id} zone={z} warehouseId={warehouse.id} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ZoneRow({ zone, warehouseId }: { zone: any; warehouseId: string }) {
  const qc = useQueryClient();
  const delFn = useServerFn(deleteWarehouseZone);
  const del = useMutation({
    mutationFn: () => delFn({ data: { id: zone.id } }),
    onSuccess: () => { toast.success("Zona eliminada"); qc.invalidateQueries({ queryKey: ["warehouse"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-semibold">{zone.zone_code}</span>
          {!zone.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">inactiva</span>}
          {zone.capacity_units != null && (
            <span className="text-[10px] text-muted-foreground">cap. {zone.capacity_units}</span>
          )}
        </div>
        {zone.description && <p className="text-xs text-muted-foreground truncate">{zone.description}</p>}
      </div>
      <div className="flex gap-1">
        <ZoneDialog warehouseId={warehouseId} zone={zone}>
          <Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button>
        </ZoneDialog>
        <Button variant="ghost" size="sm" onClick={() => {
          if (confirm("¿Eliminar zona?")) del.mutate();
        }}><Trash2 className="h-3.5 w-3.5 text-rose-600" /></Button>
      </div>
    </div>
  );
}

function WarehouseDialog({ warehouse, children }: { warehouse?: any; children: React.ReactNode }) {
  const qc = useQueryClient();
  const fn = useServerFn(upsertWarehouse);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(warehouse?.name ?? "");
  const [address, setAddress] = useState(warehouse?.address ?? "");
  const [active, setActive] = useState(warehouse?.active ?? true);

  const save = useMutation({
    mutationFn: () => fn({ data: { id: warehouse?.id, name, address, active } }),
    onSuccess: () => {
      toast.success(warehouse ? "Bodega actualizada" : "Bodega creada");
      qc.invalidateQueries({ queryKey: ["warehouse"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => {
      setOpen(v);
      if (v) { setName(warehouse?.name ?? ""); setAddress(warehouse?.address ?? ""); setActive(warehouse?.active ?? true); }
    }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{warehouse ? "Editar bodega" : "Nueva bodega"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bodega principal" />
          </div>
          <div>
            <Label>Dirección</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} id="wh-active" />
            <Label htmlFor="wh-active">Activa</Label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ZoneDialog({ warehouseId, zone, children }: { warehouseId: string; zone?: any; children: React.ReactNode }) {
  const qc = useQueryClient();
  const fn = useServerFn(upsertWarehouseZone);
  const [open, setOpen] = useState(false);
  const [zoneCode, setZoneCode] = useState(zone?.zone_code ?? "");
  const [description, setDescription] = useState(zone?.description ?? "");
  const [capacity, setCapacity] = useState<string>(zone?.capacity_units?.toString() ?? "");
  const [active, setActive] = useState(zone?.active ?? true);

  const save = useMutation({
    mutationFn: () => fn({
      data: {
        id: zone?.id,
        warehouseId,
        zoneCode,
        description,
        capacityUnits: capacity.trim() === "" ? null : Number(capacity),
        active,
      },
    }),
    onSuccess: () => {
      toast.success(zone ? "Zona actualizada" : "Zona creada");
      qc.invalidateQueries({ queryKey: ["warehouse"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => {
      setOpen(v);
      if (v) {
        setZoneCode(zone?.zone_code ?? "");
        setDescription(zone?.description ?? "");
        setCapacity(zone?.capacity_units?.toString() ?? "");
        setActive(zone?.active ?? true);
      }
    }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{zone ? "Editar zona" : "Nueva zona"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Código de zona</Label>
            <Input value={zoneCode} onChange={(e) => setZoneCode(e.target.value)} placeholder="A-01" />
          </div>
          <div>
            <Label>Descripción</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Capacidad (unidades)</Label>
            <Input type="number" min={0} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} id="zone-active" />
            <Label htmlFor="zone-active">Activa</Label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !zoneCode.trim()}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
