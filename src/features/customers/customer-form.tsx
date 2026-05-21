import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { customerSchema, type CustomerInput } from "@/features/customers/schemas";

export function CustomerForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: Partial<CustomerInput>;
  onSubmit: (v: CustomerInput) => void;
  onCancel?: () => void;
  submitting?: boolean;
}) {
  const [values, setValues] = useState<CustomerInput>({
    display_name: initial?.display_name ?? "",
    doc_type: initial?.doc_type ?? "",
    doc_number: initial?.doc_number ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    address: initial?.address ?? "",
    city: initial?.city ?? "",
    notes: initial?.notes ?? "",
    is_active: initial?.is_active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = <K extends keyof CustomerInput>(k: K, v: CustomerInput[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = customerSchema.safeParse(values);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => { errs[i.path.join(".")] = i.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    onSubmit(parsed.data);
  };

  return (
    <form onSubmit={handle} className="grid sm:grid-cols-2 gap-4">
      <Field label="Nombre / razón social *" error={errors.display_name}>
        <Input value={values.display_name} onChange={(e) => update("display_name", e.target.value)} />
      </Field>
      <Field label="Tipo doc.">
        <Input placeholder="NIT / CC / RUT…" value={values.doc_type ?? ""} onChange={(e) => update("doc_type", e.target.value)} />
      </Field>
      <Field label="Número documento">
        <Input value={values.doc_number ?? ""} onChange={(e) => update("doc_number", e.target.value)} />
      </Field>
      <Field label="Email" error={errors.email}>
        <Input type="email" value={values.email ?? ""} onChange={(e) => update("email", e.target.value)} />
      </Field>
      <Field label="Teléfono">
        <Input value={values.phone ?? ""} onChange={(e) => update("phone", e.target.value)} />
      </Field>
      <Field label="Ciudad">
        <Input value={values.city ?? ""} onChange={(e) => update("city", e.target.value)} />
      </Field>
      <Field label="Dirección" className="sm:col-span-2">
        <Input value={values.address ?? ""} onChange={(e) => update("address", e.target.value)} />
      </Field>
      <Field label="Notas" className="sm:col-span-2">
        <Textarea rows={3} value={values.notes ?? ""} onChange={(e) => update("notes", e.target.value)} />
      </Field>
      <div className="sm:col-span-2 flex items-center justify-between pt-2 border-t border-border">
        <div className="flex items-center gap-2">
          <Switch checked={values.is_active} onCheckedChange={(v) => update("is_active", v)} id="cust-active" />
          <Label htmlFor="cust-active" className="text-sm">Cliente activo</Label>
        </div>
        <div className="flex gap-2">
          {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>}
          <Button type="submit" disabled={submitting}>{submitting ? "Guardando…" : "Guardar"}</Button>
        </div>
      </div>
    </form>
  );
}

function Field({ label, error, children, className }: { label: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs mb-1.5 block text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}
