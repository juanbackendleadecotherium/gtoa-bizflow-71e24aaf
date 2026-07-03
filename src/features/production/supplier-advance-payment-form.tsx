import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileUp, Loader2, X, FileText, ImageIcon, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { MoneyInput } from "@/features/orders/money-input";
import { uploadSupplierPaymentReceipt } from "@/lib/supplier-payment-upload";
import { confirmSupplierAdvancePayment } from "@/lib/supplier-advance-payments.functions";

const MAX_SIZE = 10 * 1024 * 1024;

function isImage(mime: string) { return /^image\//i.test(mime); }
function isPdf(mime: string) { return /pdf/i.test(mime); }

export function SupplierAdvancePaymentForm({
  orderItemId,
  brandId,
  orderId,
  suggestedAmount,
  pct = 50,
  onConfirmed,
}: {
  orderItemId: string;
  brandId: string;
  orderId: string;
  suggestedAmount?: number | null;
  pct?: number;
  onConfirmed?: () => void;
}) {
  const qc = useQueryClient();
  const confirmFn = useServerFn(confirmSupplierAdvancePayment);
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState<number>(
    suggestedAmount != null ? Math.round(suggestedAmount * (pct / 100)) : 0,
  );
  const [paidAt, setPaidAt] = useState<string>(today);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = (f: File | null) => {
    setError(null);
    if (!f) { setFile(null); setPreviewUrl(null); return; }
    if (f.size > MAX_SIZE) { setError("El archivo supera 10 MB."); return; }
    if (!isImage(f.type) && !isPdf(f.type)) { setError("Solo imagen o PDF."); return; }
    setFile(f);
    setPreviewUrl(isImage(f.type) ? URL.createObjectURL(f) : null);
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!(amount > 0)) throw new Error("Monto inválido");
      if (!paidAt) throw new Error("Fecha de pago requerida");
      let uploaded: { path: string; mime: string; size: number } | null = null;
      if (file) {
        uploaded = await uploadSupplierPaymentReceipt(file, brandId, orderId, orderItemId);
      }
      await confirmFn({
        data: {
          orderItemId,
          amount,
          paidAt,
          receiptPath: uploaded?.path ?? null,
          receiptMime: uploaded?.mime ?? null,
          receiptSizeBytes: uploaded?.size ?? null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Pago confirmado. Producción iniciada.");
      qc.invalidateQueries({ queryKey: ["production-orders-drive"] });
      qc.invalidateQueries({ queryKey: ["supplier-advance-payment", orderItemId] });
      qc.invalidateQueries({ queryKey: ["my-tasks-count"] });
      onConfirmed?.();
    },
    onError: (e: any) => toast.error(e.message ?? "Error al confirmar"),
  });

  const disabled = submit.isPending;

  return (
    <div className="rounded-md border border-border bg-surface p-3 space-y-2.5">
      <div className="grid grid-cols-[1fr_140px] gap-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Monto del pago</span>
          <MoneyInput value={amount} onValueChange={setAmount} className="h-8 text-xs" />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Fecha de pago</span>
          <input
            type="date"
            value={paidAt}
            max={today}
            onChange={(e) => setPaidAt(e.target.value)}
            className="mt-0.5 w-full bg-background border border-border hover:border-primary/50 focus:border-primary rounded-md px-2 py-1 text-xs outline-none transition-colors h-8"
            disabled={disabled}
          />
        </label>
      </div>

      <div>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Comprobante (opcional — imagen o PDF)</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        {!file ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="mt-1 w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-background hover:border-primary/50 hover:bg-primary/5 px-3 py-2 text-xs text-muted-foreground transition-colors"
          >
            <FileUp className="h-3.5 w-3.5" /> Subir comprobante
          </button>
        ) : (
          <div className="mt-1 flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
            {previewUrl ? (
              <img src={previewUrl} alt="" className="h-10 w-10 rounded object-cover" />
            ) : isPdf(file.type) ? (
              <FileText className="h-5 w-5 text-rose-500" />
            ) : (
              <ImageIcon className="h-5 w-5 text-primary" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] truncate">{file.name}</p>
              <p className="text-[10px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
            <button
              type="button"
              onClick={() => pickFile(null)}
              disabled={disabled}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-[11px] text-destructive">{error}</p>}

      <button
        type="button"
        onClick={() => submit.mutate()}
        disabled={disabled || !(amount > 0)}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-primary hover:bg-primary/90 text-white text-xs font-semibold px-3 py-2 disabled:opacity-50"
      >
        {submit.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        Confirmar pago / Inicio real de producción
      </button>
      <p className="text-[10px] text-muted-foreground italic">
        Esta acción es definitiva. Una vez confirmada, no podrás editarla ni cambiar el proveedor del ítem.
      </p>
    </div>
  );
}
