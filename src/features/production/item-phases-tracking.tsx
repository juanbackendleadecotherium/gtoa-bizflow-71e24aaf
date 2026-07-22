import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Layers, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DateConfirmField } from "@/features/production/date-confirm-field";


/**
 * Compact per-phase view used inside Seguimiento de Producción when
 * order_items.has_phases = true. Reemplaza el layout de proveedor único.
 */

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
  supplier_actual_date: string | null;
  status: "pendiente" | "en_proceso" | "terminado";
  started_at: string | null;
  finished_at: string | null;
};

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}
function statusStyle(s: Phase["status"]) {
  if (s === "terminado") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  if (s === "en_proceso") return "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30";
  return "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30";
}
function statusLabel(s: Phase["status"]) {
  return s === "terminado" ? "Terminada" : s === "en_proceso" ? "En proceso" : "Pendiente";
}

export function ItemPhasesTracking({
  orderItemId,
  orderId,
  brandId,
  suppliers,
  canFinish = false,
}: {
  orderItemId: string;
  orderId: string;
  brandId: string;
  suppliers: { id: string; name: string }[];
  canFinish?: boolean;
}) {

  const qc = useQueryClient();

  const q = useQuery({
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

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["item-phases", orderItemId] });
    qc.invalidateQueries({ queryKey: ["production-orders-drive"] });
  };

  const list = q.data ?? [];

  const addPhase = useMutation({
    mutationFn: async () => {
      const nextIndex = list.length > 0 ? Math.max(...list.map((p) => p.phase_index)) + 1 : 1;
      const { error } = await (supabase as any).from("order_item_phases").insert({
        order_item_id: orderItemId,
        order_id: orderId,
        brand_id: brandId,
        phase_index: nextIndex,
        name: `Fase ${nextIndex}`,
        status: "pendiente",
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const totalCost = list.reduce(
    (a, p) => a + Number(p.negotiated_cost ?? p.manufacturing_cost ?? 0),
    0,
  );

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
          <Layers className="h-3.5 w-3.5" /> Fases ({list.length}) · Multi-proveedor
        </div>
        <button
          type="button"
          onClick={() => addPhase.mutate()}
          disabled={addPhase.isPending}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background hover:border-primary/50 px-2 py-1 text-[11px]"
        >
          {addPhase.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Agregar fase
        </button>
      </div>

      {q.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : list.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">
          Este producto está marcado como multi-proveedor pero no tiene fases. Agrega la primera.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {list.map((p) => (
              <PhaseRow key={p.id} phase={p} suppliers={suppliers} canFinish={canFinish} onChanged={invalidate} />
            ))}
          </ul>

          <div className="text-[11px] text-muted-foreground flex justify-end pt-1 border-t border-border/50">
            Costo total fases: <span className="font-semibold text-foreground tabular-nums ml-1">{fmtMoney(totalCost)}</span>
          </div>
        </>
      )}
    </div>
  );
}

function PhaseRow({
  phase,
  suppliers,
  canFinish,
  onChanged,
}: {
  phase: Phase;
  suppliers: { id: string; name: string }[];
  canFinish: boolean;
  onChanged: () => void;
}) {
  const [confirmFinish, setConfirmFinish] = useState(false);

  const [name, setName] = useState(phase.name);
  const [supplierId, setSupplierId] = useState(phase.supplier_id ?? "");
  const [cost, setCost] = useState<string>(
    phase.negotiated_cost != null ? String(phase.negotiated_cost) :
    phase.manufacturing_cost != null ? String(phase.manufacturing_cost) : "",
  );
  const [quotationDate, setQuotationDate] = useState(phase.quotation_date ?? "");
  const [promised, setPromised] = useState(phase.supplier_promised_date ?? "");
  const [actual, setActual] = useState(phase.supplier_actual_date ?? "");

  useEffect(() => {
    setName(phase.name);
    setSupplierId(phase.supplier_id ?? "");
    setCost(phase.negotiated_cost != null ? String(phase.negotiated_cost) :
            phase.manufacturing_cost != null ? String(phase.manufacturing_cost) : "");
    setQuotationDate(phase.quotation_date ?? "");
    setPromised(phase.supplier_promised_date ?? "");
    setActual(phase.supplier_actual_date ?? "");
  }, [phase.id, phase.name, phase.supplier_id, phase.manufacturing_cost, phase.negotiated_cost, phase.quotation_date, phase.supplier_promised_date, phase.supplier_actual_date]);

  const patchPhase = async (patch: Record<string, any>) => {
    const { error } = await (supabase as any).from("order_item_phases").update(patch).eq("id", phase.id);
    if (error) throw error;
  };

  const savePatch = useMutation({
    mutationFn: patchPhase,
    onSuccess: onChanged,
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const removeM = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("order_item_phases").delete().eq("id", phase.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Fase eliminada"); onChanged(); },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const commitCost = () => {
    const n = cost === "" ? null : Number(cost);
    if (n != null && Number.isNaN(n)) return;
    // Guardar como negotiated_cost cuando ya se editó desde el seguimiento
    savePatch.mutate({ negotiated_cost: n });
  };

  return (
    <li className="rounded-md border border-border bg-background p-2.5 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold shrink-0">
          {phase.phase_index}
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== phase.name && savePatch.mutate({ name: name.trim() || `Fase ${phase.phase_index}` })}
          className="flex-1 min-w-[120px] bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary text-xs font-medium outline-none px-1"
        />
        <button
          type="button"
          onClick={() => { if (confirm(`¿Eliminar "${phase.name}"?`)) removeM.mutate(); }}
          className="text-muted-foreground hover:text-destructive"
          title="Eliminar fase"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Proveedor</span>
          <select
            value={supplierId}
            onChange={(e) => {
              const v = e.target.value;
              setSupplierId(v);
              savePatch.mutate({ supplier_id: v || null });
            }}
            className="mt-0.5 w-full bg-background border border-border hover:border-primary/50 focus:border-primary rounded-md px-2 py-1 text-xs outline-none"
          >
            <option value="">— Sin proveedor</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Costo (COP)</span>
          <input
            type="number"
            min={0}
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            onBlur={commitCost}
            className="mt-0.5 w-full bg-background border border-border hover:border-primary/50 focus:border-primary rounded-md px-2 py-1 text-xs outline-none tabular-nums"
            placeholder="0"
          />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <DateInline label="Cotización" value={quotationDate}
          onChange={(v) => { setQuotationDate(v); savePatch.mutate({ quotation_date: v || null }); }} />
        <DateInline label="Prom. prov." value={promised}
          onChange={(v) => { setPromised(v); savePatch.mutate({ supplier_promised_date: v || null }); }} />
        <DateInline label="Real prov." value={actual}
          onChange={(v) => { setActual(v); savePatch.mutate({ supplier_actual_date: v || null }); }} />
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/60">
        <DateConfirmField
          label="Inicio prod."
          value={phase.started_at ? String(phase.started_at).slice(0, 10) : null}
          disabled={!canFinish}
          variant="inicio"
          isSaving={savePatch.isPending}
          confirmDescription={`Se guardará la fecha de inicio real para la fase "${phase.name}". Es independiente de las demás fases.`}
          onSave={(v) => {
            if (!v) return;
            savePatch.mutate({
              started_at: new Date(v + "T12:00:00").toISOString(),
              status: phase.status === "pendiente" ? "en_proceso" : phase.status,
            });
          }}
        />
        <DateConfirmField
          label="Terminado"
          value={phase.finished_at ? String(phase.finished_at).slice(0, 10) : null}
          disabled={!canFinish || !phase.started_at}
          variant="terminado"
          isSaving={savePatch.isPending}
          confirmDescription={`Solo afecta la fase "${phase.name}". Las otras fases del producto siguen su curso de forma independiente.`}
          onSave={(v) => {
            if (!v) return;
            savePatch.mutate(
              { finished_at: new Date(v + "T12:00:00").toISOString(), status: "terminado" },
              { onSuccess: () => toast.success(`Fase "${phase.name}" terminada`) },
            );
          }}
        />
      </div>
      {phase.finished_at && (
        <p className="text-[10px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> Terminada
        </p>
      )}


    </li>
  );
}


function DateInline({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
      <input
        type="date"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if ((v || "") !== (value || "")) onChange(v); }}
        className="mt-0.5 w-full bg-background border border-border hover:border-primary/50 focus:border-primary rounded-md px-2 py-1 text-xs outline-none"
      />
    </label>
  );
}
