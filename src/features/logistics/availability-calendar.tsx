import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, CheckCircle2, Loader2, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import { es } from "date-fns/locale";
import { addMonths, endOfMonth, format, parseISO, startOfMonth, subMonths } from "date-fns";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import {
  listAvailability,
  seedAvailableBusinessDays,
  setAvailability,
} from "@/lib/logistics-scheduling.functions";
import { useAvailabilityRealtime } from "./use-availability-realtime";

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AvailabilityCalendar() {
  useAvailabilityRealtime();
  const qc = useQueryClient();
  const listFn = useServerFn(listAvailability);
  const setFn = useServerFn(setAvailability);
  const seedFn = useServerFn(seedAvailableBusinessDays);

  const [month, setMonth] = useState<Date>(startOfMonth(new Date()));
  const [editing, setEditing] = useState<{ date: string; available: boolean; note: string } | null>(null);

  const range = useMemo(() => ({
    from: toISO(startOfMonth(subMonths(month, 0))),
    to: toISO(endOfMonth(addMonths(month, 1))),
  }), [month]);

  const availQ = useQuery({
    queryKey: ["logistics-availability", range.from, range.to],
    queryFn: () => listFn({ data: range }),
  });

  const byDate = useMemo(() => {
    const m = new Map<string, { available: boolean; note: string | null }>();
    (availQ.data ?? []).forEach((r: any) => m.set(r.date, { available: !!r.available, note: r.note ?? null }));
    return m;
  }, [availQ.data]);

  const availableSet = useMemo(() => {
    const s = new Set<string>();
    byDate.forEach((v, k) => { if (v.available) s.add(k); });
    return s;
  }, [byDate]);
  const unavailableSet = useMemo(() => {
    const s = new Set<string>();
    byDate.forEach((v, k) => { if (!v.available) s.add(k); });
    return s;
  }, [byDate]);

  const save = useMutation({
    mutationFn: (payload: { date: string; available: boolean; note?: string | null }) =>
      setFn({ data: payload }),
    onSuccess: () => {
      toast.success("Disponibilidad actualizada");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["logistics-availability"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const seed = useMutation({
    mutationFn: () => seedFn({ data: { days: 30 } }),
    onSuccess: (r: any) => {
      toast.success(`Se abrieron ${r?.inserted ?? 30} días hábiles`);
      qc.invalidateQueries({ queryKey: ["logistics-availability"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
        <div className="text-sm">
          <p className="font-medium">Disponibilidad de logística</p>
          <p className="text-muted-foreground">
            Los vendedores solo pueden agendar en días marcados como disponibles. Por defecto, un día sin registro <strong>no</strong> está disponible.
          </p>
        </div>
        <Button onClick={() => seed.mutate()} disabled={seed.isPending} variant="outline" size="sm">
          {seed.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          <span className="ml-2">Abrir próximos 30 días hábiles</span>
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 flex flex-col items-center">
        <Calendar
          mode="single"
          month={month}
          onMonthChange={setMonth}
          locale={es}
          modifiers={{
            available: (d) => availableSet.has(toISO(d)),
            unavailable: (d) => unavailableSet.has(toISO(d)),
          }}
          modifiersClassNames={{
            available: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-medium",
            unavailable: "bg-rose-500/15 text-rose-700 dark:text-rose-300 line-through",
          }}
          onSelect={(d) => {
            if (!d) return;
            const iso = toISO(d);
            const existing = byDate.get(iso);
            setEditing({
              date: iso,
              available: existing ? !existing.available : true,
              note: existing?.note ?? "",
            });
          }}
          className="p-3 pointer-events-auto"
        />
        <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Disponible</span>
          <span className="inline-flex items-center gap-1"><XCircle className="h-3.5 w-3.5 text-rose-600" /> No disponible</span>
          <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Sin registro = no disponible</span>
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? format(parseISO(editing.date), "EEEE d 'de' MMMM, yyyy", { locale: es }) : ""}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  variant={editing.available ? "default" : "outline"}
                  onClick={() => setEditing({ ...editing, available: true })}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Disponible
                </Button>
                <Button
                  className="flex-1"
                  variant={!editing.available ? "default" : "outline"}
                  onClick={() => setEditing({ ...editing, available: false })}
                >
                  <XCircle className="h-4 w-4 mr-2" /> No disponible
                </Button>
              </div>
              <div className="space-y-1">
                <Label>Nota (opcional)</Label>
                <Input
                  value={editing.note}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                  placeholder="Ej. vehículo en mantenimiento"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button
              onClick={() => editing && save.mutate({ date: editing.date, available: editing.available, note: editing.note || null })}
              disabled={save.isPending}
            >
              {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
