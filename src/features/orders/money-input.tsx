import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import type { ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number;
  onValueChange: (n: number) => void;
};

function format(raw: string): { display: string; value: number } {
  let cleaned = raw.replace(/[^\d.,]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const decIdx = Math.max(lastComma, lastDot);
  let intPart = "";
  let decPart = "";
  if (decIdx >= 0) {
    intPart = cleaned.slice(0, decIdx).replace(/[.,]/g, "");
    decPart = cleaned.slice(decIdx + 1).replace(/[.,]/g, "").slice(0, 2);
  } else {
    intPart = cleaned.replace(/[.,]/g, "");
  }
  intPart = intPart.replace(/^0+(?=\d)/, "");
  const intFmt = intPart ? Number(intPart).toLocaleString("es-CO") : "";
  const display =
    decIdx >= 0 ? `${intFmt || "0"},${decPart}` : intFmt;
  const numStr = `${intPart || "0"}${decPart ? "." + decPart : ""}`;
  const value = intPart || decPart ? Number(numStr) : 0;
  return { display, value };
}

function fromNumber(n: number): string {
  if (!n) return "";
  return n.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function MoneyInput({ value, onValueChange, ...rest }: Props) {
  const [display, setDisplay] = useState<string>(() => fromNumber(value));

  useEffect(() => {
    // Sync external value changes only when numerically different
    const parsed = format(display).value;
    if (parsed !== value) setDisplay(fromNumber(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      value={display}
      onChange={(e) => {
        const { display: d, value: v } = format(e.target.value);
        setDisplay(d);
        onValueChange(v);
      }}
    />
  );
}
