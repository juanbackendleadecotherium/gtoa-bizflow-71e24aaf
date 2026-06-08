import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Factory, Inbox, ClipboardList, ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";

export const Route = createFileRoute("/_authenticated/erp/production/")({
  head: () => ({ meta: [{ title: "Producción — Grupo Getova" }] }),
  component: ProductionHub,
});

const ACCEPTED_STATUSES = ["en_proceso", "control_calidad", "listo", "entregado"];

function ProductionHub() {
  const { brands, selectedBrandId, setSelectedBrandId, loading } = useBrand();

  const counts = useQuery({
    queryKey: ["production-hub-counts", selectedBrandId],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const [pending, accepted] = await Promise.all([
        supabase.from("production_orders").select("id, status", { count: "exact", head: false })
          .eq("brand_id", selectedBrandId!).eq("status", "pendiente"),
        supabase.from("production_orders").select("id, status", { count: "exact", head: false })
          .eq("brand_id", selectedBrandId!).in("status", ACCEPTED_STATUSES),
      ]);
      const acc = accepted.data ?? [];
      return {
        pending: pending.data?.length ?? 0,
        accepted: acc.length,
        enProceso: acc.filter((r: any) => r.status === "en_proceso").length,
        listos: acc.filter((r: any) => r.status === "listo" || r.status === "entregado").length,
      };
    },
  });

  const pendingCount = counts.data?.pending ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
          <Factory className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold">Producción</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Elige qué quieres gestionar: aprobar nuevas órdenes o el seguimiento de producción real.
          </p>
        </div>
      </div>

      {!loading && brands.length > 0 && (
        <div className="flex gap-1 border-b border-border overflow-x-auto -mx-1 px-1">
          {brands.map((b) => {
            const active = b.id === selectedBrandId;
            return (
              <button key={b.id} onClick={() => setSelectedBrandId(b.id)}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}>
                <span className="inline-block h-2 w-2 rounded-full mr-2" style={{ background: b.primary_color }} />
                {b.slug.toUpperCase()}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <HubCard
          to="/erp/production/approvals"
          icon={Inbox}
          tone="amber"
          title="Aprobar órdenes"
          subtitle="Órdenes que envían los vendedores"
          description="Revisa, acepta o rechaza con motivo las órdenes nuevas antes de iniciar producción."
          badge={pendingCount > 0 ? `${pendingCount} por revisar` : "Todo al día"}
          highlight={pendingCount > 0}
        />
        <HubCard
          to="/erp/production/tracking"
          icon={ClipboardList}
          tone="blue"
          title="Seguimiento de producción"
          subtitle="Hoja de Drive — órdenes aceptadas"
          description="Fechas de proveedor, novedades y márgenes. Edita en línea como en la hoja del Drive."
          badge={`${counts.data?.accepted ?? 0} órdenes`}
          stats={[
            { icon: Clock, label: "En proceso", value: counts.data?.enProceso ?? 0 },
            { icon: CheckCircle2, label: "Listas / entregadas", value: counts.data?.listos ?? 0 },
          ]}
        />
      </div>
    </div>
  );
}

const TONES: Record<string, { bg: string; text: string; ring: string }> = {
  amber: { bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-300", ring: "hover:border-amber-500/40" },
  blue: { bg: "bg-blue-500/10", text: "text-blue-700 dark:text-blue-300", ring: "hover:border-blue-500/40" },
};

function HubCard({
  to, icon: Icon, tone, title, subtitle, description, badge, highlight, stats,
}: {
  to: string; icon: any; tone: keyof typeof TONES;
  title: string; subtitle: string; description: string;
  badge?: string; highlight?: boolean;
  stats?: { icon: any; label: string; value: number }[];
}) {
  const t = TONES[tone];
  return (
    <Link to={to} className={`group rounded-xl border bg-surface p-5 transition-all ${t.ring} ${
      highlight ? "border-amber-500/40 shadow-[0_0_0_3px_rgb(245_158_11_/_0.08)]" : "border-border hover:shadow-md"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`h-11 w-11 rounded-lg grid place-items-center ${t.bg} ${t.text}`}>
          <Icon className="h-5 w-5" />
        </div>
        {badge && (
          <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${
            highlight ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground"
          }`}>{badge}</span>
        )}
      </div>
      <div className="mt-4">
        <h2 className="font-display text-lg font-semibold flex items-center gap-2">
          {title}
          <ArrowRight className="h-4 w-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
        </h2>
        <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">{subtitle}</p>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{description}</p>
      </div>
      {stats && stats.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border flex gap-4">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <span className="text-sm font-semibold">{s.value}</span>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}
