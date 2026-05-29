import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/features/orders/order-items-editor";
import type { ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  /** Stored money value (computed = subtotal * pct / 100) */
  value: number;
  onValueChange: (n: number) => void;
  subtotal: number;
  label?: string;
};

function pctFromValue(value: number, subtotal: number) {
  if (subtotal <= 0 || !value) return "";
  const pct = (value / subtotal) * 100;
  // Trim to 2 decimals, drop trailing zeros
  return String(Math.round(pct * 100) / 100).replace(".", ",");
}

export function AmountOrPercentInput({ value, onValueChange, subtotal, label, ...rest }: Props) {
  const [text, setText] = useState<string>(() => pctFromValue(value, subtotal));

  // When subtotal or external value changes (and user is not actively editing this field),
  // recompute the displayed percentage so it stays in sync.
  useEffect(() => {
    const next = pctFromValue(value, subtotal);
    // Only update if meaningfully different to avoid clobbering in-progress typing
    const currentNum = Number(text.replace(",", ".")) || 0;
    const nextNum = Number(next.replace(",", ".")) || 0;
    if (Math.abs(currentNum - nextNum) > 0.01) setText(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  return (
    <div className="space-y-1">
      <div className="relative">
        <Input
          {...rest}
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={text}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d,.]/g, "").replace(".", ",");
            // Only allow one comma
            const parts = raw.split(",");
            const clean = parts.length > 1 ? parts[0] + "," + parts.slice(1).join("").slice(0, 2) : raw;
            setText(clean);
            const pct = Number(clean.replace(",", ".")) || 0;
            const money = subtotal > 0 ? Math.round(((subtotal * pct) / 100) * 100) / 100 : 0;
            onValueChange(money);
          }}
          className="pr-8"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
      </div>
      <p className="text-[11px] text-muted-foreground tabular-nums">
        {subtotal <= 0
          ? "Agrega productos para calcular"
          : value > 0
            ? `${label ?? "Equivale a"}: ${formatMoney(value)}`
            : "Ingresa el porcentaje a aplicar"}
      </p>
    </div>
  );
}
