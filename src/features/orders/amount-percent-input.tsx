import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/features/orders/order-items-editor";
import type { ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number;
  onValueChange: (n: number) => void;
  subtotal: number;
  /** Helper hint shown below input */
  hint?: string;
};

function formatMoneyDisplay(n: number) {
  if (!n) return "";
  return n.toLocaleString("es-CO", { maximumFractionDigits: 2 });
}

function parseInput(raw: string, subtotal: number): { text: string; value: number; isPct: boolean; pct: number | null } {
  const trimmed = raw.trim();
  const isPct = trimmed.endsWith("%");
  if (isPct) {
    const numStr = trimmed.slice(0, -1).replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
    const pct = numStr ? Number(numStr) : 0;
    const value = subtotal > 0 ? Math.round(((subtotal * pct) / 100) * 100) / 100 : 0;
    // Keep the user's raw text so they can keep typing freely
    return { text: trimmed, value, isPct: true, pct: isNaN(pct) ? 0 : pct };
  }
  // Money mode
  const cleaned = trimmed.replace(/[^\d,]/g, "");
  const decIdx = cleaned.indexOf(",");
  let intPart = decIdx >= 0 ? cleaned.slice(0, decIdx) : cleaned;
  const decPart = decIdx >= 0 ? cleaned.slice(decIdx + 1).replace(/,/g, "").slice(0, 2) : "";
  intPart = intPart.replace(/^0+(?=\d)/, "");
  const intFmt = intPart ? Number(intPart).toLocaleString("es-CO") : "";
  const text = decIdx >= 0 ? `${intFmt || "0"},${decPart}` : intFmt;
  const numStr = `${intPart || "0"}${decPart ? "." + decPart : ""}`;
  const value = intPart || decPart ? Number(numStr) : 0;
  return { text, value, isPct: false, pct: null };
}

export function AmountOrPercentInput({ value, onValueChange, subtotal, hint, ...rest }: Props) {
  const [text, setText] = useState<string>(() => formatMoneyDisplay(value));
  const [isPct, setIsPct] = useState(false);

  // Sync external value when not actively in percent mode
  useEffect(() => {
    if (isPct) return;
    const parsed = parseInput(text, subtotal).value;
    if (parsed !== value) setText(formatMoneyDisplay(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // If in percent mode and subtotal changes, recompute amount
  useEffect(() => {
    if (!isPct) return;
    const { value: v } = parseInput(text, subtotal);
    if (v !== value) onValueChange(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  const currentPct = subtotal > 0 ? (value / subtotal) * 100 : 0;

  return (
    <div className="space-y-1">
      <Input
        {...rest}
        type="text"
        inputMode="decimal"
        placeholder="0  o  10%"
        value={text}
        onChange={(e) => {
          const parsed = parseInput(e.target.value, subtotal);
          setText(parsed.text);
          setIsPct(parsed.isPct);
          onValueChange(parsed.value);
        }}
        onBlur={() => {
          // On blur, if in money mode, normalize formatting
          if (!isPct) setText(formatMoneyDisplay(value));
        }}
      />
      <p className="text-[11px] text-muted-foreground tabular-nums">
        {subtotal <= 0
          ? hint ?? "Agrega productos para ver el equivalente"
          : isPct
            ? `= ${formatMoney(value)} sobre el subtotal`
            : value > 0
              ? `Equivale al ${currentPct.toLocaleString("es-CO", { maximumFractionDigits: 2 })}% del subtotal`
              : "Puedes escribir un monto (200.000) o un porcentaje (10%)"}
      </p>
    </div>
  );
}
