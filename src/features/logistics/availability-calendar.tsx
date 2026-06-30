import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, CheckCircle2, Loader2, Sparkles, XCircle, MousePointer2 } from "lucide-react";
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
  setAvailabilityBulk,
} from "@/lib/logistics-scheduling.functions";
import { useAvailabilityRealtime } from "./use-availability-realtime";

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AvailabilityCalendar() {
  useAvailabilityRealtime();
  const qc = useQueryClient();
  const listFn = useServerFn(listAvailability);
  const bulkFn = useServerFn(setAvailabilityBulk);
  const seedFn = useServerFn(seedAvailableBusinessDays);

  const [month, setMonth] = useState<Date>(startOfMonth(new Date()));
  const [range, setRange] = useState<{ from?: Date; to?: Date } | undefined>(undefined);
  const [confirming, setConfirming] = useState<{ dates: string[]; available: boolean; note: string } | null>(null);

  const rangeWindow = useMemo(() => ({
    from: toISO(startOfMonth(subMonths(month, 0))),
    to: toISO(endOfMonth(addMonths(month, 1))),
  }), [month]);

  const availQ = useQuery({
    queryKey: ["logistics-availability", rangeWindow.from, rangeWindow.to],
    queryFn: () => listFn({ data: rangeWindow }),
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

  // Build list of dates covered by current selection (range or single)
  const selectedDates: string[] = useMemo(() => {
    if (!range?.from) return [];
    const start = range.from;
    const end = range.to ?? range.from;
    const a = start < end ? start : end;
    const b = start < end ? end : start;
    const out: string[] = [];
    const cur = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    while (cur <= b) {
      out.push(toISO(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }, [range]);

  // Mouse-drag selection inside the calendar grid
  useEffect(() => {
    const root = document.getElementById("availability-calendar-root");
    if (!root) return;
    let dragging = false;
    let startISO: string | null = null;

    const dayISOFromEvent = (ev: Event): string | null => {
      const el = (ev.target as HTMLElement)?.closest("button[name='day']") as HTMLButtonElement | null;
      const v = el?.getAttribute("aria-label");
      // Fallback: parse from data attribute — react-day-picker stores day in textContent
      // Easier: read the date via the button's "value" or aria-label using the displayed text.
      // The day cells have aria-label like "miércoles, 1 de julio de 2026" in es locale —
      // we instead use the data-day attribute when present:
      const dataDay = el?.getAttribute("data-day");
      if (dataDay) return dataDay;
      if (!v) return null;
      return null;
    };

    const onDown = (ev: MouseEvent) => {
      const iso = dayISOFromEvent(ev);
      if (!iso) return;
      dragging = true;
      startISO = iso;
      setRange({ from: parseISO(iso), to: parseISO(iso) });
    };
    const onMove = (ev: MouseEvent) => {
      if (!dragging || !startISO) return;
      const iso = dayISOFromEvent(ev);
      if (!iso) return;
      const a = parseISO(startISO);
      const b = parseISO(iso);
      setRange({ from: a < b ? a : b, to: a < b ? b : a });
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      startISO = null;
    };

    root.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      root.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const save = useMutation({
    mutationFn: (payload: { dates: string[]; available: boolean; note?: string | null }) =>
      bulkFn({ data: payload }),
    onSuccess: (_r, vars) => {
      toast.success(`Actualizadas ${vars.dates.length} fechas`);
      setConfirming(null);
      setRange(undefined);
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
            Selecciona un rango (arrastrando el mouse o con Shift+click) para marcar varios días a la vez.
            Por defecto, un día sin registro <strong>no</strong> está disponible.
          </p>
        </div>
        <Button onClick={() => seed.mutate()} disabled={seed.isPending} variant="outline" size="sm">
          {seed.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          <span className="ml-2">Abrir próximos 30 días hábiles</span>
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 flex flex-col items-center" id="availability-calendar-root">
        <Calendar
          mode="range"
          selected={range as any}
          onSelect={(r: any) => setRange(r)}
          month={month}
          onMonthChange={setMonth}
          locale={es}
          numberOfMonths={1}
          modifiers={{
            available: (d) => availableSet.has(toISO(d)),
            unavailable: (d) => unavailableSet.has(toISO(d)),
          }}
          modifiersClassNames={{
            available: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-medium",
            unavailable: "bg-rose-500/15 text-rose-700 dark:text-rose-300 line-through",
          }}
          className="p-3 pointer-events-auto select-none"
        />
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Disponible</span>
          <span className="inline-flex items-center gap-1"><XCircle className="h-3.5 w-3.5 text-rose-600" /> No disponible</span>
          <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Sin registro = no disponible</span>
          <span className="inline-flex items-center gap-1"><MousePointer2 className="h-3.5 w-3.5" /> Arrastra el mouse o usa Shift+click para rangos</span>
        </div>

        {selectedDates.length > 0 && (
          <div className="mt-4 w-full max-w-md flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
            <span>
              <strong>{selectedDates.length}</strong> {selectedDates.length === 1 ? "día seleccionado" : "días seleccionados"}
              {selectedDates.length > 1 && (
                <span className="text-muted-foreground ml-1">
                  ({format(parseISO(selectedDates[0]), "d MMM", { locale: es })} → {format(parseISO(selectedDates[selectedDates.length - 1]), "d MMM", { locale: es })})
                </span>
              )}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setRange(undefined)}>Limpiar</Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirming({ dates: selectedDates, available: false, note: "" })}
              >
                <XCircle className="h-4 w-4" /> No disponibles
              </Button>
              <Button
                size="sm"
                onClick={() => setConfirming({ dates: selectedDates, available: true, note: "" })}
              >
                <CheckCircle2 className="h-4 w-4" /> Disponibles
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirming
                ? `Marcar ${confirming.dates.length} ${confirming.dates.length === 1 ? "día" : "días"} como ${confirming.available ? "disponibles" : "no disponibles"}`
                : ""}
            </DialogTitle>
          </DialogHeader>
          {confirming && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {format(parseISO(confirming.dates[0]), "EEEE d 'de' MMMM yyyy", { locale: es })}
                {confirming.dates.length > 1 && (
                  <> → {format(parseISO(confirming.dates[confirming.dates.length - 1]), "EEEE d 'de' MMMM yyyy", { locale: es })}</>
                )}
              </p>
              <div className="space-y-1">
                <Label>Nota (opcional, se aplica a todos)</Label>
                <Input
                  value={confirming.note}
                  onChange={(e) => setConfirming({ ...confirming, note: e.target.value })}
                  placeholder="Ej. vehículo en mantenimiento"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>Cancelar</Button>
            <Button
              onClick={() =>
                confirming &&
                save.mutate({
                  dates: confirming.dates,
                  available: confirming.available,
                  note: confirming.note || null,
                })
              }
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
