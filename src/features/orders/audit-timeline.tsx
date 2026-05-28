import { useMemo, useState } from "react";
import {
  PlusCircle,
  Pencil,
  Trash2,
  FileEdit,
  MessageSquare,
} from "lucide-react";
import { formatMoney } from "@/features/orders/order-items-editor";
import { cn } from "@/lib/utils";

export type AuditRow = {
  id: string;
  created_at: string;
  changed_by: string | null;
  changed_by_email: string | null;
  action: string;
  entity: string;
  field: string | null;
  old_value: unknown;
  new_value: unknown;
};

const FIELD_LABELS: Record<string, string> = {
  notes: "Notas",
  discount: "Descuento",
  tax: "Impuesto",
  customer_id: "Cliente",
  estimated_delivery_date: "Entrega estimada",
  seller_id: "Vendedor",
};

const MONEY_FIELDS = new Set(["discount", "tax"]);
const DATE_FIELDS = new Set(["estimated_delivery_date"]);

type Kind = "added" | "modified" | "deleted" | "order";

function kindOf(a: AuditRow): Kind {
  if (a.action === "item_insert") return "added";
  if (a.action === "item_delete") return "deleted";
  if (a.action === "item_update") return "modified";
  return "order";
}

const KIND_META: Record<
  Kind,
  { label: string; Icon: typeof PlusCircle; dot: string; chip: string }
> = {
  added: {
    label: "Producto agregado",
    Icon: PlusCircle,
    dot: "bg-emerald-500",
    chip: "text-emerald-600 dark:text-emerald-400",
  },
  modified: {
    label: "Producto modificado",
    Icon: Pencil,
    dot: "bg-amber-500",
    chip: "text-amber-600 dark:text-amber-400",
  },
  deleted: {
    label: "Producto eliminado",
    Icon: Trash2,
    dot: "bg-rose-500",
    chip: "text-rose-600 dark:text-rose-400",
  },
  order: {
    label: "Datos del pedido",
    Icon: FileEdit,
    dot: "bg-sky-500",
    chip: "text-sky-600 dark:text-sky-400",
  },
};

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "hace unos segundos";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  const isYest = d.toDateString() === yest.toDateString();
  const time = d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
  if (isToday) return `hoy ${time}`;
  if (isYest) return `ayer ${time}`;
  if (diff < 7 * 86400)
    return d.toLocaleDateString("es-CO", { weekday: "long" }) + " " + time;
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" }) + " " + time;
}

function fullDate(iso: string) {
  return new Date(iso).toLocaleString("es-CO");
}

function asNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
  return null;
}

function formatFieldValue(field: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (MONEY_FIELDS.has(field)) {
    const n = asNumber(v);
    return n === null ? String(v) : `$${formatMoney(n)}`;
  }
  if (DATE_FIELDS.has(field)) {
    try {
      return new Date(String(v)).toLocaleDateString("es-CO");
    } catch {
      return String(v);
    }
  }
  if (typeof v === "string") return v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function ItemDetails({ data, prefix }: { data: any; prefix?: string }) {
  if (!data) return null;
  const qty = Number(data.quantity ?? 0);
  const price = Number(data.unit_price ?? 0);
  return (
    <div className="text-sm text-foreground/90">
      {prefix && <span className="text-muted-foreground">{prefix} </span>}
      <span className="font-medium">"{data.description}"</span>
      <span className="text-muted-foreground">
        {" · "}
        {qty} {qty === 1 ? "unidad" : "unidades"} · ${formatMoney(price)}
      </span>
    </div>
  );
}

function ItemDiff({ old: o, next: n }: { old: any; next: any }) {
  const rows: { label: string; from: string; to: string }[] = [];
  if (o?.description !== n?.description)
    rows.push({ label: "Descripción", from: String(o?.description ?? "—"), to: String(n?.description ?? "—") });
  if (Number(o?.quantity) !== Number(n?.quantity))
    rows.push({
      label: "Cantidad",
      from: String(Number(o?.quantity ?? 0)),
      to: String(Number(n?.quantity ?? 0)),
    });
  if (Number(o?.unit_price) !== Number(n?.unit_price))
    rows.push({
      label: "Precio",
      from: `$${formatMoney(Number(o?.unit_price ?? 0))}`,
      to: `$${formatMoney(Number(n?.unit_price ?? 0))}`,
    });
  return (
    <div className="space-y-0.5 text-sm">
      <div className="text-foreground/90 font-medium">
        "{n?.description ?? o?.description}"
      </div>
      {rows.map((r) => (
        <div key={r.label} className="text-sm text-muted-foreground">
          {r.label}:{" "}
          <span className="line-through text-muted-foreground/70">{r.from}</span>{" "}
          <span className="text-foreground">→ {r.to}</span>
        </div>
      ))}
    </div>
  );
}

function NotesDiff({ old: o, next: n }: { old: unknown; next: unknown }) {
  const [open, setOpen] = useState(false);
  const oldStr = (o as string) ?? "";
  const newStr = (n as string) ?? "";
  const isLong = (oldStr + newStr).length > 160;
  if (!isLong || open) {
    return (
      <div className="text-sm space-y-1">
        <div className="text-muted-foreground">
          Antes:{" "}
          <span className="text-foreground/80 whitespace-pre-wrap">
            {oldStr || "—"}
          </span>
        </div>
        <div className="text-muted-foreground">
          Ahora:{" "}
          <span className="text-foreground whitespace-pre-wrap">{newStr || "—"}</span>
        </div>
        {isLong && (
          <button className="text-xs text-accent" onClick={() => setOpen(false)}>
            Ver menos
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="text-sm">
      <div className="text-muted-foreground">
        Nota actualizada · {newStr.length} caracteres
      </div>
      <button className="text-xs text-accent" onClick={() => setOpen(true)}>
        Ver detalle
      </button>
    </div>
  );
}

type FilterKey = "all" | "items" | "order";

export function AuditTimeline({ entries }: { entries: AuditRow[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    if (filter === "items") return entries.filter((e) => e.entity === "order_item");
    return entries.filter((e) => e.entity === "order");
  }, [entries, filter]);

  if (entries.length === 0)
    return (
      <p className="text-xs text-muted-foreground">Sin cambios registrados todavía.</p>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { k: "all", label: "Todo" },
            { k: "items", label: "Productos" },
            { k: "order", label: "Datos del pedido" },
          ] as { k: FilterKey; label: string }[]
        ).map((c) => (
          <button
            key={c.k}
            onClick={() => setFilter(c.k)}
            className={cn(
              "px-2.5 py-1 text-xs rounded-full border transition-colors",
              filter === c.k
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <ol className="relative space-y-4 before:absolute before:left-[7px] before:top-1 before:bottom-1 before:w-px before:bg-border">
        {filtered.map((a) => {
          const kind = kindOf(a);
          const meta = KIND_META[kind];
          const Icon = meta.Icon;
          const who = a.changed_by_email?.split("@")[0] ?? "Alguien";
          return (
            <li key={a.id} className="relative pl-7">
              <span
                className={cn(
                  "absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full ring-4 ring-surface",
                  meta.dot,
                )}
              />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                <Icon className={cn("h-3.5 w-3.5", meta.chip)} />
                <span className="font-medium">{who}</span>
                <span className={cn("text-xs uppercase tracking-wider", meta.chip)}>
                  {kind === "order"
                    ? `Cambió ${FIELD_LABELS[a.field ?? ""] ?? "datos del pedido"}`
                    : meta.label}
                </span>
                <span
                  className="text-xs text-muted-foreground"
                  title={fullDate(a.created_at)}
                >
                  · {relativeDate(a.created_at)}
                </span>
              </div>

              <div className="mt-1.5">
                {kind === "added" && <ItemDetails data={a.new_value} />}
                {kind === "deleted" && (
                  <ItemDetails data={a.old_value} prefix="Se eliminó" />
                )}
                {kind === "modified" && (
                  <ItemDiff old={a.old_value} next={a.new_value} />
                )}
                {kind === "order" && a.field === "notes" && (
                  <NotesDiff old={a.old_value} next={a.new_value} />
                )}
                {kind === "order" && a.field !== "notes" && (
                  <div className="text-sm text-muted-foreground">
                    <span className="line-through text-muted-foreground/70">
                      {formatFieldValue(a.field ?? "", a.old_value)}
                    </span>{" "}
                    <span className="text-foreground">
                      → {formatFieldValue(a.field ?? "", a.new_value)}
                    </span>
                  </div>
                )}
              </div>

              {a.changed_by_email && (
                <p className="mt-1 text-[11px] text-muted-foreground/80 flex items-center gap-1">
                  <MessageSquare className="h-3 w-3 opacity-60" />
                  {a.changed_by_email}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
