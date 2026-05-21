import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { passwordCriteria, scorePassword } from "../schemas/auth-schemas";

const LABELS = ["Muy débil", "Débil", "Aceptable", "Fuerte", "Excelente"];
const COLORS = [
  "bg-destructive",
  "bg-destructive",
  "bg-amber-500",
  "bg-amber-400",
  "bg-emerald-500",
];

export function PasswordStrength({ value }: { value: string }) {
  const { score, total, passed } = scorePassword(value);
  const passedIds = new Set(passed.map((p) => p.id));
  const idx = Math.max(0, score - 1);

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i < score ? COLORS[idx] : "bg-muted",
            )}
          />
        ))}
      </div>
      {value.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Fortaleza: <span className="font-medium text-foreground">{LABELS[idx]}</span>
        </p>
      )}
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
        {passwordCriteria.map((c) => {
          const ok = passedIds.has(c.id);
          return (
            <li
              key={c.id}
              className={cn(
                "flex items-center gap-1.5",
                ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
              )}
            >
              {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              {c.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
