import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { markOrderItemFinished } from "@/lib/order-items-finish.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function FinishItemButton({
  itemId,
  finishedAt,
  finishedByEmail,
  canFinish,
}: {
  itemId: string;
  finishedAt: string | null;
  finishedByEmail: string | null;
  canFinish: boolean;
  isAdmin?: boolean;
}) {
  const qc = useQueryClient();
  const mark = useServerFn(markOrderItemFinished);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["production-orders-drive"] });
    qc.invalidateQueries({ queryKey: ["warehouse"] });
    qc.invalidateQueries({ queryKey: ["my-tasks"] });
    qc.invalidateQueries({ queryKey: ["my-tasks-count"] });
  };

  const markMut = useMutation({
    mutationFn: () => mark({ data: { itemId } }),
    onSuccess: () => { toast.success("Producto marcado como terminado"); refresh(); setConfirmOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (finishedAt) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-2 py-0.5">
          <CheckCircle2 className="h-3 w-3" /> Terminado · {new Date(finishedAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
          {finishedByEmail ? ` · ${finishedByEmail}` : ""}
        </span>
      </div>
    );
  }

  if (!canFinish) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={markMut.isPending}
        className="text-[10px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md px-2.5 py-1.5 whitespace-nowrap inline-flex items-center gap-1 disabled:opacity-50"
        title="Marca este producto como terminado en producción. Si todos los productos quedan terminados, se avisa al vendedor para gestionar el cobro."
      >
        {markMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
        Marcar terminado
      </button>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !markMut.isPending && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Marcar este producto como terminado?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción notifica al vendedor y actualiza el estado en producción y bodega.
              Solo debes confirmarla si el producto está realmente terminado. Si todos los
              productos de la venta quedan terminados, se le avisa al vendedor para gestionar el cobro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={markMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); markMut.mutate(); }}
              disabled={markMut.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-600"
            >
              {markMut.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Marcando…</>
              ) : (
                <>Sí, marcar terminado</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
