import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MoneyInput } from "@/features/orders/money-input";
import { ImageUploader, type PendingImage } from "@/features/orders/image-uploader";
import { uploadOrderImage } from "@/lib/image-upload";
import { DEPOSIT_ACCOUNTS, ACCOUNT_REQUIRED_METHODS } from "./deposit-accounts";
import { formatMoney } from "@/features/orders/order-items-editor";

const METHODS = ["Transferencia", "Efectivo", "Tarjeta", "PSE", "Nequi", "Daviplata", "Otro"];

export function PaymentDialog({
  open, onOpenChange, orderId, brandId, balance,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  brandId: string;
  balance: number;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("Transferencia");
  const [depositAccount, setDepositAccount] = useState<string>("");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<PendingImage[]>([]);

  const accountRequired = ACCOUNT_REQUIRED_METHODS.has(method);

  const reset = () => {
    setAmount(0); setMethod("Transferencia"); setDepositAccount(""); setReference("");
    setPaidAt(new Date().toISOString().slice(0, 10)); setNote(""); setPending([]);
  };

  const MAX_TOTAL_MB = 40;

  const mut = useMutation({
    mutationFn: async () => {
      if (amount <= 0) throw new Error("El monto debe ser mayor a cero.");
      if (accountRequired && !depositAccount) {
        throw new Error("Selecciona la cuenta a la que llegó el dinero.");
      }
      const totalBytes = pending.reduce((s, p) => s + p.file.size, 0);
      if (totalBytes > MAX_TOTAL_MB * 1024 * 1024) {
        throw new Error(`El total de comprobantes supera ${MAX_TOTAL_MB} MB.`);
      }
      const proof_urls: string[] = [];
      for (const p of pending) {
        proof_urls.push(await uploadOrderImage(p.file, `payments/${orderId}`));
      }
      const { error } = await supabase.from("order_payments").insert({
        order_id: orderId, brand_id: brandId, amount, method,
        reference: reference || null, paid_at: paidAt, note: note || null,
        proof_url: proof_urls[0] ?? null,
        proof_urls,
        deposit_account: depositAccount || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pago registrado");
      qc.invalidateQueries({ queryKey: ["order-payments", orderId] });
      qc.invalidateQueries({ queryKey: ["order-financials"] });
      qc.invalidateQueries({ queryKey: ["order-audit", orderId] });
      qc.invalidateQueries({ queryKey: ["finance-dashboard"] });
      qc.invalidateQueries({ queryKey: ["finance-receivables"] });
      qc.invalidateQueries({ queryKey: ["finance-accounts"] });
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const newBalance = Math.max(0, balance - amount);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>
            Saldo pendiente actual: <span className="font-medium tabular-nums">{formatMoney(balance)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">Monto</Label>
              <MoneyInput value={amount} onValueChange={setAmount} allowDecimals />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Fecha de pago</Label>
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">Método</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Referencia (opcional)</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N° transacción" />
            </div>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">
              Cuenta destino {accountRequired && <span className="text-destructive">*</span>}
            </Label>
            <Select value={depositAccount} onValueChange={setDepositAccount}>
              <SelectTrigger>
                <SelectValue placeholder={accountRequired ? "¿A qué cuenta llegó el dinero?" : "Opcional"} />
              </SelectTrigger>
              <SelectContent>
                {DEPOSIT_ACCOUNTS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">
              Sirve para que finanzas pueda trazar dónde quedó el dinero recibido.
            </p>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">Nota (opcional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">Comprobante (opcional)</Label>
            <ImageUploader pending={pending} onChangePending={setPending} label="Subir comprobante" />
          </div>

          {amount > 0 && (
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs flex justify-between">
              <span className="text-muted-foreground">Saldo después del pago</span>
              <span className="tabular-nums font-medium">{formatMoney(newBalance)}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || amount <= 0}>
            {mut.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Guardando…</> : "Registrar pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
