import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Plus, Trash2, Save, Play, CheckCircle2, Layers } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/features/orders/money-input";

type Phase = {
  id: string;
  order_item_id: string;
  phase_index: number;
  name: string;
  supplier_id: string | null;
  manufacturing_cost: number | null;
  negotiated_cost: number | null;
  quotation_date: string | null;
  supplier_promised_date: string | null;
  status: "pendiente" | "en_proceso" | "terminado";
  started_at: string | null;
  finished_at: string | null;
  notes: string | null;
};

type Supplier = { id: string; name: string; category?: string | null };

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

function statusBadge(s: Phase["status"]) {
  if (s === "terminado") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  if (s === "en_proceso") return "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30";
  return "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30";
}
function statusLabel(s: Phase["status"]) {
  return s === "terminado" ? "Terminada" : s === "en_proceso" ? "En proceso" : "Pendiente";
}

export function ItemPhasesEditor({
  orderItemId,
  orderId,
  brandId,
  productionOrderId,
  realProductionOrderId,
  suppliers,
  onChanged,
}: {
  orderItemId: string;
  orderId: string;
  brandId: string;
  productionOrderId?: string | null;
  realProductionOrderId?: string | null;
  suppliers: Supplier[];
  onChanged?: () => void;
}) {
  const qc = useQueryClient();

  const phases = useQuery({
    queryKey: ["item-phases", orderItemId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("order_item_phases")
        .select("*")
        .eq("order_item_id", orderItemId)
        .order("phase_index", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Phase[];
    },
  });

  const list = phases.data ?? [];

  const addPhase = useMutation({
    mutationFn: async () => {
      const nextIndex = list.length > 0 ? Math.max(...list.map((p) => p.phase_index)) + 1 : 1;
      const payload: any = {
        order_item_id: orderItemId,
        order_id: orderId,
        brand_id: brandId,
        production_order_id: productionOrderId ?? null,
        real_production_order_id: realProductionOrderId ?? null,
        phase_index: nextIndex,
        name: `Fase ${nextIndex}`,
        status: "pendiente",
      };
      const { error } = await (supabase as any).from("order_item_phases").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["item-phases", orderItemId] });
      onChanged?.();
    },
    onError: (e: any) => toast.error(e.message ?? "Error al crear fase"),
  });

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Fases de producción ({list.length})
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => addPhase.mutate()} disabled={addPhase.isPending} className="h-7 gap-1">
          {addPhase.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Agregar fase
        </Button>
      </div>

      {phases.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : list.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Divide este producto en fases (ej. construcción, pintura, tapizado) para asignar un proveedor distinto y costo independiente a cada una.
        </p>
      ) : (
        <div className="space-y-2">
          {list.map((ph) => (
            <PhaseRow key={ph.id} phase={ph} suppliers={suppliers} onChanged={() => {
              qc.invalidateQueries({ queryKey: ["item-phases", orderItemId] });
              onChanged?.();
            }} />
          ))}
          <PhasesSummary phases={list} />
        </div>
      )}
    </div>
  );
}

function PhasesSummary({ phases }: { phases: Phase[] }) {
  const total = phases.reduce((acc, p) => acc + Number(p.negotiated_cost ?? p.manufacturing_cost ?? 0), 0);
  const suppliersSet = new Set(phases.map((p) => p.supplier_id).filter(Boolean));
  return (
    <div className="rounded-md border border-border bg-background/60 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
      <span className="text-muted-foreground">
        Costo total fases: <span className="font-semibold text-foreground tabular-nums">{fmtMoney(total)}</span>
      </span>
      <span className="text-muted-foreground">
        Proveedores distintos: <span className="font-semibold text-foreground">{suppliersSet.size}</span>
      </span>
    </div>
  );
}

function PhaseRow({
  phase,
  suppliers,
  onChanged,
}: {
  phase: Phase;
  suppliers: Supplier[];
  onChanged: () => void;
}) {
  const [name, setName] = useState(phase.name);
  const [supplierId, setSupplierId] = useState(phase.supplier_id ?? "");
  const [cost, setCost] = useState<number>(Number(phase.manufacturing_cost ?? 0));
  const [negotiatedCost, setNegotiatedCost] = useState<number>(Number(phase.negotiated_cost ?? 0));
  const [hasNegotiated, setHasNegotiated] = useState<boolean>(phase.negotiated_cost != null);
  const [quotationDate, setQuotationDate] = useState(phase.quotation_date ?? "");
  const [promisedDate, setPromisedDate] = useState(phase.supplier_promised_date ?? "");
  const [notes, setNotes] = useState(phase.notes ?? "");
  const [dirty, setDirty] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("order_item_phases")
        .update({
          name: name.trim() || `Fase ${phase.phase_index}`,
          supplier_id: supplierId || null,
          manufacturing_cost: cost > 0 ? cost : null,
          negotiated_cost: hasNegotiated && negotiatedCost > 0 ? negotiatedCost : null,
          quotation_date: quotationDate || null,
          supplier_promised_date: promisedDate || null,
          notes: notes || null,
        })
        .eq("id", phase.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Fase "${name}" guardada`);
      setDirty(false);
      onChanged();
    },
    onError: (e: any) => toast.error(e.message ?? "Error al guardar"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("order_item_phases").delete().eq("id", phase.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fase eliminada");
      onChanged();
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const startPhase = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("start_item_phase", { _phase_id: phase.id, _started_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fase iniciada");
      onChanged();
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const finishPhase = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("finish_item_phase", { _phase_id: phase.id, _finished_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fase terminada");
      onChanged();
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const effective = hasNegotiated && negotiatedCost > 0 ? negotiatedCost : cost;

  return (
    <div className="rounded-md border border-border bg-background p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary/15 text-primary text-[11px] font-bold">
          {phase.phase_index}
        </span>
        <Input
          value={name}
          onChange={(e) => { setName(e.target.value); setDirty(true); }}
          className="h-8 flex-1 min-w-[160px] font-medium"
          placeholder="Nombre de la fase"
        />
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusBadge(phase.status)}`}>
          {statusLabel(phase.status)}
        </span>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
          onClick={() => { if (confirm(`¿Eliminar fase "${phase.name}"?`)) remove.mutate(); }}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-[11px] text-muted-foreground mb-1 block">Proveedor</Label>
          <Select
            value={supplierId || "__none__"}
            onValueChange={(v) => { setSupplierId(v === "__none__" ? "" : v); setDirty(true); }}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Sin proveedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sin proveedor</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}{s.category ? ` · ${s.category}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground mb-1 block">Costo (COP)</Label>
          <MoneyInput
            value={cost}
            onValueChange={(n) => { setCost(n); setDirty(true); }}
            placeholder="0"
            className="h-8"
          />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground mb-1 block">Fecha cotización</Label>
          <Input type="date" value={quotationDate}
            onChange={(e) => { setQuotationDate(e.target.value); setDirty(true); }}
            className="h-8" />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground mb-1 block">Fecha prometida</Label>
          <Input type="date" value={promisedDate}
            onChange={(e) => { setPromisedDate(e.target.value); setDirty(true); }}
            className="h-8" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11px]">
          <input type="checkbox" checked={hasNegotiated}
            onChange={(e) => { setHasNegotiated(e.target.checked); setDirty(true); }} />
          <span>Costo renegociado</span>
        </label>
        {hasNegotiated && (
          <MoneyInput
            value={negotiatedCost}
            onValueChange={(n) => { setNegotiatedCost(n); setDirty(true); }}
            placeholder="0"
            className="h-8 max-w-[160px]"
          />
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          Costo efectivo: <span className="font-semibold text-foreground tabular-nums">{fmtMoney(effective)}</span>
        </span>
      </div>

      <Textarea rows={2} value={notes}
        onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
        placeholder="Notas de la fase (opcional)" className="text-xs" />

      <div className="flex items-center justify-end gap-2 flex-wrap">
        {phase.status === "pendiente" && (
          <Button size="sm" variant="outline" className="h-7 gap-1"
            onClick={() => startPhase.mutate()} disabled={startPhase.isPending || !supplierId}>
            <Play className="h-3 w-3" /> Iniciar
          </Button>
        )}
        {phase.status !== "terminado" && (
          <Button size="sm" variant="outline" className="h-7 gap-1"
            onClick={() => finishPhase.mutate()} disabled={finishPhase.isPending}>
            <CheckCircle2 className="h-3 w-3" /> Terminar
          </Button>
        )}
        {dirty && (
          <Button size="sm" className="h-7 gap-1"
            onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Guardar
          </Button>
        )}
      </div>
    </div>
  );
}
