import {
  Plus, ShieldAlert, Check, FileUp, FileX, Pencil, RefreshCw, Factory, User, Calendar,
} from "lucide-react";

type AuditRow = {
  id: string;
  action: string;
  field: string | null;
  old_value: any;
  new_value: any;
  note: string | null;
  changed_by_email: string | null;
  created_at: string;
};

const FIELD_LABELS: Record<string, string> = {
  status: "Estado",
  workshop: "Taller",
  assigned_to: "Encargado",
  priority: "Prioridad",
  due_date: "Entrega estimada",
  notes: "Notas",
};

const STATUS_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  listo: "Listo",
  entregado: "Entregado",
  rechazada: "Rechazada",
};

function describe(a: AuditRow): { icon: React.ReactNode; title: string; tone: string; detail?: string } {
  if (a.action === "create") {
    return {
      icon: <Plus className="h-3.5 w-3.5" />,
      title: "Enviada a producción",
      tone: "bg-primary/15 text-primary border-primary/30",
      detail: a.new_value?.code ? `Código ${a.new_value.code}` : undefined,
    };
  }
  if (a.action === "rejected") {
    return {
      icon: <ShieldAlert className="h-3.5 w-3.5" />,
      title: "Rechazada y devuelta al vendedor",
      tone: "bg-destructive/15 text-destructive border-destructive/30",
    };
  }
  if (a.action === "resubmitted") {
    return {
      icon: <RefreshCw className="h-3.5 w-3.5" />,
      title: "Reenviada a producción con correcciones",
      tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    };
  }
  if (a.action === "status") {
    const to = typeof a.new_value === "string" ? a.new_value : a.new_value?.toString?.() ?? "";
    const from = typeof a.old_value === "string" ? a.old_value : "";
    const toLabel = STATUS_LABELS[to] ?? to;
    if (to === "en_proceso" && from === "pendiente") {
      return {
        icon: <Check className="h-3.5 w-3.5" />,
        title: "Orden aceptada — pasa a seguimiento",
        tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
      };
    }
    if (to === "listo") {
      return {
        icon: <Factory className="h-3.5 w-3.5" />,
        title: "Producción terminada",
        tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
      };
    }
    return {
      icon: <RefreshCw className="h-3.5 w-3.5" />,
      title: `Estado → ${toLabel}`,
      tone: "bg-muted text-foreground border-border",
      detail: from ? `Antes: ${STATUS_LABELS[from] ?? from}` : undefined,
    };
  }
  if (a.action === "planimetry_upload") {
    return {
      icon: <FileUp className="h-3.5 w-3.5" />,
      title: `Planimetría subida (v${a.new_value?.version ?? "?"})`,
      tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
      detail: a.new_value?.file_name ?? undefined,
    };
  }
  if (a.action === "planimetry_delete") {
    return {
      icon: <FileX className="h-3.5 w-3.5" />,
      title: "Planimetría eliminada",
      tone: "bg-muted text-muted-foreground border-border",
      detail: a.old_value?.file_name ?? undefined,
    };
  }
  if (a.action === "update" && a.field) {
    const label = FIELD_LABELS[a.field] ?? a.field;
    const fmt = (v: any) =>
      v == null || v === "" ? "—" : typeof v === "string" ? v : JSON.stringify(v);
    return {
      icon: <Pencil className="h-3.5 w-3.5" />,
      title: `${label} actualizado`,
      tone: "bg-muted text-foreground border-border",
      detail: `${fmt(a.old_value)} → ${fmt(a.new_value)}`,
    };
  }
  return {
    icon: <Pencil className="h-3.5 w-3.5" />,
    title: a.action,
    tone: "bg-muted text-foreground border-border",
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function AuditTimeline({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">Sin movimientos aún.</p>;
  }
  return (
    <ol className="space-y-3">
      {rows.map((a) => {
        const d = describe(a);
        return (
          <li key={a.id} className="relative pl-7">
            <span
              className={`absolute left-0 top-0.5 grid h-5 w-5 place-items-center rounded-full border ${d.tone}`}
              aria-hidden
            >
              {d.icon}
            </span>
            <p className="text-sm font-medium text-foreground leading-tight">{d.title}</p>
            {d.detail && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate" title={d.detail}>
                {d.detail}
              </p>
            )}
            {a.note && (
              <p className="text-xs mt-1 rounded-md bg-muted/50 border border-border px-2 py-1 italic text-foreground/80">
                "{a.note}"
              </p>
            )}
            <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" /> {formatDate(a.created_at)}
              </span>
              {a.changed_by_email && (
                <span className="inline-flex items-center gap-1">
                  <User className="h-3 w-3" /> {a.changed_by_email}
                </span>
              )}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
