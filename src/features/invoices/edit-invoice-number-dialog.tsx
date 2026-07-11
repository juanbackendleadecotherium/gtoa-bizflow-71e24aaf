import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { changeOrderInvoiceNumber } from "@/lib/invoices.functions";

export function EditInvoiceNumberButton({
  orderId,
  currentInvoiceNumber,
}: {
  orderId: string;
  currentInvoiceNumber: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentInvoiceNumber ?? "");
  const qc = useQueryClient();
  const changeFn = useServerFn(changeOrderInvoiceNumber);

  const mutation = useMutation({
    mutationFn: async () => {
      const next = value.trim();
      if (!next) throw new Error("Ingresa un número válido");
      if (next === (currentInvoiceNumber ?? "")) return { invoice_number: next };
      return await changeFn({ data: { order_id: orderId, invoice_number: next } });
    },
    onSuccess: (res) => {
      toast.success(`Número actualizado a ${res.invoice_number}`);
      setOpen(false);
      // Invalida todo lo que muestra invoice_number (se hereda por joins)
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      qc.invalidateQueries({ queryKey: ["invoice", orderId] });
      qc.invalidateQueries({ queryKey: ["invoice-versions"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order-audit", orderId] });
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setValue(currentInvoiceNumber ?? "");
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground underline decoration-dotted underline-offset-2"
        title="Editar número de cuenta de cobro"
      >
        <Pencil className="h-3 w-3" />
        Editar
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar número de cuenta de cobro</DialogTitle>
            <DialogDescription>
              Cambia el número de esta venta. El anterior se liberará y quedará disponible
              para futuras ventas. El cambio se aplica en todos los módulos que muestran
              este número.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Número de cuenta de cobro</Label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Ej. GTO-0123"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              Debe respetar el prefijo configurado para la marca (formato PREFIJO-NNNN).
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
                "Guardar cambio"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
