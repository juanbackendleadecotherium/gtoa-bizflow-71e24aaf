import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import type { ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number;
  onValueChange: (n: number) => void;
  /** Allow decimal input (comma as decimal separator). Default false. */
  allowDecimals?: boolean;
};

function format(raw: string, allowDecimals: boolean): { display: string; value: number } {
  if (!allowDecimals) {
    const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    const display = digits ? Number(digits).toLocaleString("es-CO") : "";
    return { display, value: digits ? Number(digits) : 0 };
  }
  // Decimals allowed: ',' is the only decimal separator; '.' is thousands and ignored.
  let cleaned = raw.replace(/[^\d,]/g, "");
  const decIdx = cleaned.indexOf(",");
  let intPart = decIdx >= 0 ? cleaned.slice(0, decIdx) : cleaned;
  let decPart = decIdx >= 0 ? cleaned.slice(decIdx + 1).replace(/,/g, "").slice(0, 2) : "";
  intPart = intPart.replace(/^0+(?=\d)/, "");
  const intFmt = intPart ? Number(intPart).toLocaleString("es-CO") : "";
  const display = decIdx >= 0 ? `${intFmt || "0"},${decPart}` : intFmt;
  const numStr = `${intPart || "0"}${decPart ? "." + decPart : ""}`;
  const value = intPart || decPart ? Number(numStr) : 0;
  return { display, value };
}

function fromNumber(n: number, allowDecimals: boolean): string {
  if (!n) return "";
  return n.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: allowDecimals ? 2 : 0,
  });
}

export function MoneyInput({ value, onValueChange, allowDecimals = false, ...rest }: Props) {
  const [display, setDisplay] = useState<string>(() => fromNumber(value, allowDecimals));

  useEffect(() => {
    const parsed = format(display, allowDecimals).value;
    if (parsed !== value) setDisplay(fromNumber(value, allowDecimals));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Input
      {...rest}
      type="text"
      inputMode={allowDecimals ? "decimal" : "numeric"}
      value={display}
      onChange={(e) => {
        const { display: d, value: v } = format(e.target.value, allowDecimals);
        setDisplay(d);
        onValueChange(v);
      }}
    />
  );
}
