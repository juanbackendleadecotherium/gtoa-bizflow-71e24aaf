import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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

/**
 * Campo de fecha editable con doble validación por AlertDialog.
 * - value: fecha ISO (YYYY-MM-DD o timestamptz) o null.
 * - onSave: recibe "YYYY-MM-DD" o null (borrado) tras confirmar.
 * - disabled: campo de solo lectura.
 * - variant: cambia el color/tono del CTA de confirmación.
 * - confirmDescription: texto adicional dentro del diálogo.
 */
export function DateConfirmField({
  label,
  value,
  onSave,
  disabled = false,
  variant = "generic",
  confirmDescription,
  allowClear = false,
  isSaving = false,
  hint,
}: {
  label: string;
  value: string | null;
  onSave: (v: string | null) => void;
  disabled?: boolean;
  variant?: "inicio" | "terminado" | "generic";
  confirmDescription?: string;
  allowClear?: boolean;
  isSaving?: boolean;
  hint?: string;
}) {
  const initial = value ? String(value).slice(0, 10) : "";
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setDraft(value ? String(value).slice(0, 10) : "");
  }, [value]);

  const currentIso = value ? String(value).slice(0, 10) : "";

  const openConfirm = (next: string) => {
    if (next === currentIso) return;
    if (!next && !allowClear) {
      // no permitir vaciar sin allowClear: revertir
      setDraft(currentIso);
      return;
    }
    setPending(next || null);
    setOpen(true);
  };

  const cancel = () => {
    setDraft(currentIso);
    setPending(null);
    setOpen(false);
  };

  const confirm = () => {
    onSave(pending);
    setOpen(false);
  };

  const btnCls =
    variant === "terminado"
      ? "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-600"
      : variant === "inicio"
        ? "bg-primary hover:bg-primary/90"
        : "";

  const fmtHuman = (iso: string | null) => {
    if (!iso) return "sin fecha";
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
  };

  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </span>
      <div className="relative">
        <input
          type="date"
          value={draft}
          disabled={disabled || isSaving}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => openConfirm(draft)}
          className={`mt-0.5 w-full border rounded-md px-2 py-1 text-xs outline-none transition-colors ${
            disabled
              ? "bg-muted/40 border-border/60 text-muted-foreground cursor-not-allowed"
              : "bg-background border-border hover:border-primary/50 focus:border-primary"
          }`}
        />
        {isSaving && (
          <Loader2 className="h-3 w-3 animate-spin absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        )}
      </div>
      {hint && <span className="mt-0.5 block text-[10px] text-muted-foreground italic">{hint}</span>}

      <AlertDialog open={open} onOpenChange={(o) => (o ? setOpen(true) : cancel())}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Confirmar {label.toLowerCase()} como {fmtHuman(pending)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDescription ??
                "Esta fecha se guardará en el sistema. Verifica que sea correcta antes de confirmar."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancel}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirm} className={btnCls}>
              Sí, confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </label>
  );
}
