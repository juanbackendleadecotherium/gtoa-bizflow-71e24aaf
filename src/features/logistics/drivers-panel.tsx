import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Power, Truck } from "lucide-react";
import { toast } from "sonner";

import {
  listDrivers, upsertDriver, setDriverAvailability, deactivateDriver,
} from "@/lib/drivers.functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const AVAILABILITY_LABEL: Record<string, string> = {
  disponible: "Disponible",
  en_ruta: "En ruta",
  no_disponible: "No disponible",
};
const AVAILABILITY_TONE: Record<string, string> = {
  disponible: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  en_ruta: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
  no_disponible: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40",
};

type Driver = {
  id: string; full_name: string; phone: string | null;
  vehicle_label: string | null; vehicle_type: "propio" | "externo";
  availability: "disponible" | "en_ruta" | "no_disponible";
  notes: string | null; active: boolean;
};

export function DriversPanel({ canManage }: { canManage: boolean }) {
  const listFn = useServerFn(listDrivers);
  const setAvail = useServerFn(setDriverAvailability);
  const toggleActive = useServerFn(deactivateDriver);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["drivers"],
    queryFn: () => listFn(),
  });

  const availMut = useMutation({
    mutationFn: (v: { id: string; availability: any }) =>
      setAvail({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drivers"] }),
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const activeMut = useMutation({
    mutationFn: (v: { id: string; active: boolean }) =>
      toggleActive({ data: v }),
    onSuccess: () => { toast.success("Conductor actualizado"); qc.invalidateQueries({ queryKey: ["drivers"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Truck className="h-4 w-4" /> Conductores y vehículos
        </h3>
        {canManage && <DriverDialog />}
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        {q.isLoading ? (
          <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (q.data ?? []).length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center">
            Aún no hay conductores registrados.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Conductor</TableHead>
                <TableHead>Vehículo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Disponibilidad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(q.data ?? []).map((d: Driver) => (
                <TableRow key={d.id} className={!d.active ? "opacity-50" : ""}>
                  <TableCell>
                    <div className="font-medium">{d.full_name}</div>
                    {d.phone && <div className="text-[11px] text-muted-foreground">{d.phone}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{d.vehicle_label ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize text-[10px]">{d.vehicle_type}</Badge>
                  </TableCell>
                  <TableCell>
                    {canManage && d.active ? (
                      <Select
                        value={d.availability}
                        onValueChange={(v) => availMut.mutate({ id: d.id, availability: v as any })}
                      >
                        <SelectTrigger className={`h-8 w-36 text-xs border ${AVAILABILITY_TONE[d.availability]}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="disponible">Disponible</SelectItem>
                          <SelectItem value="en_ruta">En ruta</SelectItem>
                          <SelectItem value="no_disponible">No disponible</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={`inline-flex text-[11px] px-2 py-0.5 rounded-md border ${AVAILABILITY_TONE[d.availability]}`}>
                        {AVAILABILITY_LABEL[d.availability]}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={d.active ? "default" : "secondary"} className="text-[10px]">
                      {d.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    {canManage && (
                      <>
                        <DriverDialog driver={d} />
                        <Button
                          size="sm" variant="ghost"
                          onClick={() => activeMut.mutate({ id: d.id, active: !d.active })}
                          title={d.active ? "Desactivar" : "Reactivar"}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function DriverDialog({ driver }: { driver?: Driver }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => ({
    fullName: driver?.full_name ?? "",
    phone: driver?.phone ?? "",
    vehicleLabel: driver?.vehicle_label ?? "",
    vehicleType: (driver?.vehicle_type ?? "propio") as "propio" | "externo",
    notes: driver?.notes ?? "",
  }));
  const upsertFn = useServerFn(upsertDriver);
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: () => upsertFn({
      data: {
        id: driver?.id,
        fullName: form.fullName,
        phone: form.phone || null,
        vehicleLabel: form.vehicleLabel || null,
        vehicleType: form.vehicleType,
        notes: form.notes || null,
      },
    }),
    onSuccess: () => {
      toast.success(driver ? "Conductor actualizado" : "Conductor creado");
      qc.invalidateQueries({ queryKey: ["drivers"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {driver ? (
          <Button size="sm" variant="ghost">Editar</Button>
        ) : (
          <Button size="sm" className="gap-2"><Plus className="h-3.5 w-3.5" />Nuevo conductor</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{driver ? "Editar conductor" : "Nuevo conductor"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Nombre</Label>
            <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Teléfono</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Tipo de vehículo</Label>
              <Select value={form.vehicleType} onValueChange={(v: any) => setForm({ ...form, vehicleType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="propio">Camión propio</SelectItem>
                  <SelectItem value="externo">Vehículo externo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Etiqueta del vehículo</Label>
            <Input
              value={form.vehicleLabel}
              onChange={(e) => setForm({ ...form, vehicleLabel: e.target.value })}
              placeholder="Camión propio NRX-123 · Moto Carlos"
            />
          </div>
          <div className="space-y-1">
            <Label>Notas</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !form.fullName.trim()}>
            {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
