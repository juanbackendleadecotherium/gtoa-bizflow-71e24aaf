import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

/**
 * Botón + diálogo para editar el número de factura de Alegra asociado
 * a una venta. Se guarda directamente en `orders.alegra_invoice_number`
 * (RLS controla el acceso por marca/rol).
 */
export function EditAlegraInvoiceButton({
  orderId,
  currentAlegraNumber,
}: {
  orderId: string;
  currentAlegraNumber: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentAlegraNumber ?? "");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const next = value.trim();
      const { error } = await supabase
        .from("orders")
        .update({ alegra_invoice_number: next || null })
        .eq("id", orderId);
      if (error) throw new Error(error.message);
      return { alegra_invoice_number: next || null };
    },
    onSuccess: (res) => {
      toast.success(
        res.alegra_invoice_number
          ? `Factura Alegra guardada: ${res.alegra_invoice_number}`
          : "Factura Alegra eliminada",
      );
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasValue = !!currentAlegraNumber;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setValue(currentAlegraNumber ?? "");
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground underline decoration-dotted underline-offset-2"
        title={hasValue ? "Editar factura de Alegra" : "Vincular factura de Alegra"}
      >
        {hasValue ? <Pencil className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
        {hasValue ? "Editar" : "Vincular Alegra"}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Factura de Alegra</DialogTitle>
            <DialogDescription>
              Ingresa el número de la factura equivalente en Alegra para relacionarla con
              esta venta del ERP. Puedes dejarlo vacío para desvincularla.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Nro. factura Alegra</Label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Ej. 1940"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              Este número es solo referencial: no reemplaza el consecutivo del ERP.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={mutation.isPending}>
              Cancelar
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Guardando…
                </>
              ) : (
                "Guardar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
