import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type EligibleItem = {
  id: string;
  description: string;
  quantity: number;
  line_total: number;
};

function firstLine(s: string) {
  const idx = s.indexOf("\n");
  return idx === -1 ? s : s.slice(0, idx);
}
function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

export function LinkChildItemDialog({
  open,
  onOpenChange,
  parentId,
  eligible,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  parentId: string;
  eligible: EligibleItem[];
  onLinked: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const link = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      if (ids.length === 0) return;
      const { error } = await supabase
        .from("order_items")
        .update({ parent_item_id: parentId } as any)
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Productos vinculados");
      setSelected(new Set());
      onOpenChange(false);
      onLinked();
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Vincular productos hijos
          </DialogTitle>
          <DialogDescription>
            Selecciona los productos que forman parte de este mismo grupo (ej. sillas de un comedor). Su costo sumará al del padre para calcular el margen.
          </DialogDescription>
        </DialogHeader>

        {eligible.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No hay productos disponibles para vincular en esta orden.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
            {eligible.map((it) => {
              const checked = selected.has(it.id);
              return (
                <label
                  key={it.id}
                  className={`flex items-start gap-2 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                    checked ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(it.id)}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{firstLine(it.description) || "Producto"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      ×{Number(it.quantity)} · {fmtMoney(Number(it.line_total))}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={() => link.mutate()}
            disabled={selected.size === 0 || link.isPending}
            className="gap-1"
          >
            {link.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Vincular ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
