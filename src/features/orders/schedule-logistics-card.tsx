import { useMemo, useState } from "react";
import { useMutation, useQuery, useServerFn, useQueryClient } from "@tanstack/react-query";
import { useServerFn as useSrvFn } from "@tanstack/react-start";
import { CalendarDays, CheckCircle2, XCircle, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  getInvoiceSchedulingStatus,
  listAvailability,
  scheduleInvoiceLogistics,
  clearInvoiceLogisticsSchedule,
} from "@/lib/logistics-scheduling.functions";
import { useAvailabilityRealtime } from "@/features/logistics/use-availability-realtime";

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ScheduleLogisticsCard({ orderId }: { orderId: string }) {
  useAvailabilityRealtime();
  const qc = useQueryClient();
  const statusFn = useSrvFn(getInvoiceSchedulingStatus);
  const availFn = useSrvFn(listAvailability);
  const scheduleFn = useSrvFn(scheduleInvoiceLogistics);
  const clearFn = useSrvFn(clearInvoiceLogisticsSchedule);

  const [month, setMonth] = useState<Date>(startOfMonth(new Date()));
  const [open, setOpen] = useState(false);

  const statusQ = useQuery({
    queryKey: ["invoice-scheduling-status", orderId],
    queryFn: () => statusFn({ data: { orderId } }),
  });

  // Cargar disponibilidad del mes visible + el siguiente
  const range = useMemo(() => ({
    from: toISO(startOfMonth(month)),
    to: toISO(endOfMonth(addMonths(month, 1))),
  }), [month]);

  const availQ = useQuery({
    queryKey: ["logistics-availability", range.from, range.to],
    queryFn: () => availFn({ data: range }),
  });

  const availableSet = useMemo(() => {
    const s = new Set<string>();
    (availQ.data ?? []).forEach((r: any) => { if (r.available) s.add(r.date); });
    return s;
  }, [availQ.data]);

  const noteMap = useMemo(() => {
    const m = new Map<string, string>();
    (availQ.data ?? []).forEach((r: any) => { if (r.note) m.set(r.date, r.note); });
    return m;
  }, [availQ.data]);

  const schedule = useMutation({
    mutationFn: (date: string) => scheduleFn({ data: { orderId, date } }),
    onSuccess: () => {
      toast.success("Logística agendada");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["invoice-scheduling-status", orderId] });
      qc.invalidateQueries({ queryKey: ["pickup-orders"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al agendar"),
  });

  const clear = useMutation({
    mutationFn: () => clearFn({ data: { orderId } }),
    onSuccess: () => {
      toast.success("Agendamiento cancelado");
      qc.invalidateQueries({ queryKey: ["invoice-scheduling-status", orderId] });
      qc.invalidateQueries({ queryKey: ["pickup-orders"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  if (statusQ.isLoading) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando estado de logística...
      </div>
    );
  }
  const s = statusQ.data;
  if (!s) return null;

  const scheduled = s.scheduledDate;

  return (
    <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4" />
        <h3 className="text-sm font-semibold">Programar logística</h3>
      </div>

      <ul className="space-y-1.5 text-sm">
        <ConditionRow ok={s.conditions.status.ok} label={`Estado: ${s.conditions.status.label || "—"}`} />
        <ConditionRow
          ok={s.conditions.balance.ok}
          label={
            s.conditions.balance.ok
              ? "Saldo cobrado en su totalidad"
              : `Saldo pendiente: $${Number(s.conditions.balance.balance).toLocaleString("es-CO")}`
          }
        />
        <ConditionRow
          ok={s.conditions.qa.ok}
          label={s.conditions.qa.exists ? "Control de calidad aprobado" : "Control de calidad (no implementado aún)"}
          neutral={!s.conditions.qa.exists}
        />
      </ul>

      {scheduled ? (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
          <div>
            <p className="text-xs text-muted-foreground">Agendada para</p>
            <p className="text-sm font-semibold">
              {format(parseISO(scheduled), "EEEE d 'de' MMMM, yyyy", { locale: es })}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => clear.mutate()} disabled={clear.isPending}>
            {clear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            <span className="ml-1">Cancelar</span>
          </Button>
        </div>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              className="w-full"
              disabled={!s.canSchedule}
              title={!s.canSchedule ? "La factura aún no cumple las condiciones" : undefined}
            >
              <CalendarDays className="h-4 w-4 mr-2" />
              Agendar fecha de logística
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              month={month}
              onMonthChange={setMonth}
              locale={es}
              disabled={(date) => {
                if (date < new Date(new Date().setHours(0, 0, 0, 0))) return true;
                return !availableSet.has(toISO(date));
              }}
              modifiers={{ available: (date) => availableSet.has(toISO(date)) }}
              modifiersClassNames={{ available: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-medium" }}
              onSelect={(d) => { if (d) schedule.mutate(toISO(d)); }}
              className="p-3 pointer-events-auto"
            />
            <div className="border-t p-2 text-xs text-muted-foreground">
              Los días en verde están disponibles. {availQ.isFetching ? "Actualizando…" : ""}
            </div>
            {noteMap.size > 0 && (
              <div className="border-t p-2 text-xs space-y-1 max-h-24 overflow-auto">
                {Array.from(noteMap.entries()).slice(0, 3).map(([d, n]) => (
                  <div key={d}><span className="font-medium">{format(parseISO(d), "d MMM", { locale: es })}:</span> {n}</div>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function ConditionRow({ ok, label, neutral }: { ok: boolean; label: string; neutral?: boolean }) {
  const Icon = neutral ? CheckCircle2 : ok ? CheckCircle2 : XCircle;
  return (
    <li className="flex items-center gap-2">
      <Icon className={cn("h-4 w-4", neutral ? "text-muted-foreground" : ok ? "text-emerald-600" : "text-amber-600")} />
      <span className={cn(neutral && "text-muted-foreground")}>{label}</span>
    </li>
  );
}

// silence unused
void useServerFn; void TooltipProvider; void Tooltip; void TooltipContent; void TooltipTrigger; void subMonths;
