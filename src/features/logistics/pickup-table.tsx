import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  Loader2, MapPin, Truck, Package, AlertCircle, CheckCircle2,
  CircleDashed, XCircle, ArrowRight, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

import {
  listPickupOrders, updatePickupBasics, assignDriver, updatePickupStatus,
} from "@/lib/pickup-orders.functions";
import { listDrivers } from "@/lib/drivers.functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

const STATUS_META: Record<string, { label: string; tone: string; icon: any }> = {
  pendiente: { label: "Pendiente", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40", icon: AlertCircle },
  asignada: { label: "Asignada", tone: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40", icon: CircleDashed },
  en_camino: { label: "En camino", tone: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/40", icon: Truck },
  recogida: { label: "Recogida", tone: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/40", icon: Package },
  entregada: { label: "Entregada", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40", icon: CheckCircle2 },
  cancelada: { label: "Cancelada", tone: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40", icon: XCircle },
};

const NEXT_STATUS: Record<string, "asignada" | "en_camino" | "recogida" | "entregada" | null> = {
  pendiente: null,        // requires driver
  asignada: "en_camino",
  en_camino: "recogida",
  recogida: "entregada",
  entregada: null,
  cancelada: null,
};

type Pickup = any;

export function PickupTable({
  statuses, canManage, brandId,
}: { statuses: string[]; canManage: boolean; brandId?: string | null }) {
  const listFn = useServerFn(listPickupOrders);
  const q = useQuery({
    queryKey: ["pickup-orders", statuses.join(","), brandId],
    queryFn: () => listFn({ data: { statuses: statuses as any, brandId: brandId ?? undefined } }),
  });

  const rows = q.data ?? [];
  const totalExternal = useMemo(
    () => rows.reduce((s: number, r: any) => s + Number(r.external_transport_cost ?? 0), 0),
    [rows],
  );

  return (
    <div className="space-y-3">
      {statuses.includes("entregada") && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Costos logísticos externos (rango actual)
          </p>
          <p className="text-base font-semibold">{COP.format(totalExternal)}</p>
        </div>
      )}

      {q.isLoading ? (
        <div className="p-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No hay recogidas en este estado.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((p: Pickup) => (
            <PickupRow key={p.id} pickup={p} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}

function PickupRow({ pickup, canManage }: { pickup: Pickup; canManage: boolean }) {
  const meta = STATUS_META[pickup.status];
  const Icon = meta?.icon ?? AlertCircle;
  const next = NEXT_STATUS[pickup.status];
  const order = pickup.order ?? {};
  const driver = pickup.driver;
  const invoiceLabel = order.invoice_number ? `Fact. ${order.invoice_number}` : order.order_number;

  return (
    <article className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${meta?.tone}`}
            >
              <Icon className="h-3 w-3" />
              {meta?.label}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {pickup.brand?.name ?? "—"}
            </span>
            {invoiceLabel && (
              <Link
                to="/erp/orders/$id"
                params={{ id: order.id }}
                className="text-[11px] font-medium text-primary hover:underline inline-flex items-center gap-1"
              >
                {invoiceLabel} <ExternalLink className="h-3 w-3" />
              </Link>
            )}
            {order.scheduled_logistics_date && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                📅 Agendada {new Date(order.scheduled_logistics_date + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold truncate">{pickup.product_description_snapshot}</h3>
          <p className="text-xs text-muted-foreground">Cliente: {order.customer_name ?? "—"}</p>
        </div>
        {canManage && pickup.status !== "entregada" && pickup.status !== "cancelada" && (
          <div className="flex flex-wrap items-center gap-2">
            <EditBasicsDialog pickup={pickup} />
            <AssignDriverDialog pickup={pickup} />
            {next && (
              <AdvanceStatusButton pickup={pickup} target={next} />
            )}
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg bg-muted/40 p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" /> Recoger en
          </p>
          <p className="font-medium">{pickup.supplier_name_snapshot ?? "Proveedor no definido"}</p>
          <p className="text-muted-foreground">{pickup.pickup_address_snapshot ?? "Dirección por confirmar"}</p>
        </div>
        <div className="rounded-lg bg-muted/40 p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <ArrowRight className="h-3 w-3" /> Destino
          </p>
          <p className="font-medium capitalize">{pickup.destination}</p>
          <p className="text-muted-foreground">
            {pickup.destination === "cliente"
              ? pickup.destination_address_snapshot
                  ?? [order.customer_address, order.customer_city].filter(Boolean).join(", ")
                  ?? "Dirección del cliente"
              : "Bodega"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground border-t border-border pt-2">
        <div className="flex items-center gap-2">
          <Truck className="h-3 w-3" />
          {driver
            ? <span><strong className="text-foreground">{driver.full_name}</strong> · {driver.vehicle_label ?? driver.vehicle_type}</span>
            : <span>Sin conductor asignado</span>}
        </div>
        <div>Creada {new Date(pickup.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}</div>
      </div>

      {pickup.status === "entregada" && pickup.external_transport_cost && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs">
          <strong>Costo logístico externo: </strong>{COP.format(Number(pickup.external_transport_cost))}
          {pickup.external_transport_notes && <span className="block text-muted-foreground">{pickup.external_transport_notes}</span>}
        </div>
      )}
      {pickup.status === "entregada" && pickup.destination === "bodega" && (
        <Link
          to="/erp/warehouse"
          search={{ tab: "intake", prefill_item: pickup.order_item_id } as any}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Registrar ingreso a bodega <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </article>
  );
}

function EditBasicsDialog({ pickup }: { pickup: Pickup }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    pickupAddress: pickup.pickup_address_snapshot ?? "",
    destination: (pickup.destination ?? "bodega") as "bodega" | "cliente",
    destinationAddress: pickup.destination_address_snapshot
      ?? [pickup.order?.customer_address, pickup.order?.customer_city].filter(Boolean).join(", "),
    notes: pickup.notes ?? "",
  });
  const fn = useServerFn(updatePickupBasics);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => fn({ data: { pickupId: pickup.id, ...form, destinationWarehouseId: null } }),
    onSuccess: () => { toast.success("Recogida actualizada"); qc.invalidateQueries({ queryKey: ["pickup-orders"] }); setOpen(false); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Editar datos</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Editar datos de recogida</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Dirección de recogida (proveedor)</Label>
            <Input value={form.pickupAddress} onChange={(e) => setForm({ ...form, pickupAddress: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Destino</Label>
            <Select value={form.destination} onValueChange={(v: any) => setForm({ ...form, destination: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bodega">Bodega</SelectItem>
                <SelectItem value="cliente">Cliente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.destination === "cliente" && (
            <div className="space-y-1">
              <Label>Dirección del cliente</Label>
              <Textarea value={form.destinationAddress} rows={2}
                onChange={(e) => setForm({ ...form, destinationAddress: e.target.value })} />
            </div>
          )}
          <div className="space-y-1">
            <Label>Notas</Label>
            <Textarea value={form.notes} rows={2} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignDriverDialog({ pickup }: { pickup: Pickup }) {
  const [open, setOpen] = useState(false);
  const [driverId, setDriverId] = useState<string>(pickup.driver_id ?? "");
  const driversFn = useServerFn(listDrivers);
  const assignFn = useServerFn(assignDriver);
  const qc = useQueryClient();

  const dQ = useQuery({ queryKey: ["drivers"], queryFn: () => driversFn(), enabled: open });
  const mut = useMutation({
    mutationFn: () => assignFn({ data: { pickupId: pickup.id, driverId } }),
    onSuccess: () => { toast.success("Conductor asignado"); qc.invalidateQueries({ queryKey: ["pickup-orders"] }); qc.invalidateQueries({ queryKey: ["drivers"] }); setOpen(false); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={pickup.driver_id ? "outline" : "default"}>
          {pickup.driver_id ? "Cambiar conductor" : "Asignar conductor"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Asignar conductor</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Label>Selecciona un conductor</Label>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {(dQ.data ?? []).filter((d: any) => d.active).map((d: any) => {
              const busy = d.availability !== "disponible" && d.id !== pickup.driver_id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => !busy && setDriverId(d.id)}
                  disabled={busy}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    driverId === d.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                  } ${busy ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{d.full_name}</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] capitalize ${
                        d.availability === "disponible"
                          ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                          : "border-amber-500/40 text-amber-700 dark:text-amber-300"
                      }`}
                    >
                      {d.availability.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {d.vehicle_label ?? "—"} · {d.vehicle_type}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={!driverId || mut.isPending}>
            {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Asignar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdvanceStatusButton({ pickup, target }: { pickup: Pickup; target: "en_camino" | "recogida" | "entregada" | "asignada" }) {
  const [open, setOpen] = useState(false);
  const [externalCost, setExternalCost] = useState<string>(pickup.external_transport_cost?.toString() ?? "");
  const [externalNotes, setExternalNotes] = useState<string>(pickup.external_transport_notes ?? "");
  const fn = useServerFn(updatePickupStatus);
  const qc = useQueryClient();
  const isExternal = pickup.driver?.vehicle_type === "externo";
  const needsCost = target === "entregada" && isExternal;

  const mut = useMutation({
    mutationFn: () => fn({
      data: {
        pickupId: pickup.id,
        status: target,
        externalCost: needsCost ? Number(externalCost) : (externalCost ? Number(externalCost) : null),
        externalNotes: externalNotes || null,
      },
    }),
    onSuccess: () => {
      toast.success("Estado actualizado");
      qc.invalidateQueries({ queryKey: ["pickup-orders"] });
      qc.invalidateQueries({ queryKey: ["drivers"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const label = STATUS_META[target].label;

  // Direct action when no extra data needed
  if (target !== "entregada") {
    return (
      <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>
        {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Marcar {label.toLowerCase()}
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Marcar entregada</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Confirmar entrega</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {isExternal && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs">
              Vehículo externo: registra el costo del transporte.
            </div>
          )}
          <div className="space-y-1">
            <Label>Costo de transporte externo (COP) {needsCost && <span className="text-destructive">*</span>}</Label>
            <Input type="number" min="0" value={externalCost}
              onChange={(e) => setExternalCost(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Notas del transporte</Label>
            <Textarea rows={2} value={externalNotes} onChange={(e) => setExternalNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || (needsCost && !externalCost)}>
            {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Confirmar entrega
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelPickupDialog({ pickup }: { pickup: Pickup }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const fn = useServerFn(updatePickupStatus);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => fn({ data: { pickupId: pickup.id, status: "cancelada", cancelReason: reason } }),
    onSuccess: () => { toast.success("Recogida cancelada"); qc.invalidateQueries({ queryKey: ["pickup-orders"] }); setOpen(false); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">Cancelar</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Cancelar recogida</DialogTitle></DialogHeader>
        <Textarea rows={3} placeholder="Motivo de la cancelación"
          value={reason} onChange={(e) => setReason(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Volver</Button>
          <Button variant="destructive" onClick={() => mut.mutate()}
            disabled={mut.isPending || reason.trim().length < 5}>
            {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Cancelar recogida
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
