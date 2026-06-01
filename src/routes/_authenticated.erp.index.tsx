import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Settings, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";

export const Route = createFileRoute("/_authenticated/erp/")({
  component: ErpDashboard,
});

function ErpDashboard() {
  const { brands, selectedBrand, selectedBrandId, isAdmin, roles } = useBrand();

  const statsQuery = useQuery({
    queryKey: ["erp-stats", selectedBrandId],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const orders = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", selectedBrandId!);
      return { orders: orders.count ?? 0 };
    },
  });

  if (brands.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface p-6">
        <p className="font-medium mb-1">Aún no tienes marcas asignadas</p>
        <p className="text-sm text-muted-foreground">
          Un administrador debe asignarte acceso a una o más marcas.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-2">
          Resumen · {selectedBrand?.name}
        </p>
        <h1 className="font-display text-3xl font-semibold mb-2">Panel operativo</h1>
        <p className="text-muted-foreground">
          Toda la operación gira alrededor de las ventas de la marca activa.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        <Stat label="Ventas" value={statsQuery.data?.orders ?? "—"} />
        <Stat label="Tu rol" value={roles.length > 0 ? roles.join(", ") : "Sin rol"} muted />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <ActionCard to="/erp/orders" icon={ClipboardList} title="Ventas" desc="Crea, edita y haz seguimiento a las ventas." />
        {isAdmin && (
          <ActionCard to="/erp/settings/statuses" icon={Settings} title="Estados" desc="Configura el flujo de estados de la marca." />
        )}
      </div>
    </>
  );
}

function Stat({ label, value, muted }: { label: string; value: string | number; muted?: boolean }) {
  return (
    <div className={`rounded-xl border bg-surface p-5 ${muted ? "border-dashed" : ""}`}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">{label}</p>
      <p className="font-display text-2xl font-semibold capitalize truncate">{value}</p>
    </div>
  );
}

function ActionCard({ to, icon: Icon, title, desc }: { to: string; icon: typeof ClipboardList; title: string; desc: string }) {
  return (
    <Link to={to} className="group rounded-xl border border-border bg-surface p-5 hover:border-accent hover:shadow-sm transition-all">
      <div className="flex items-center justify-between mb-3">
        <div className="rounded-md bg-accent/15 p-2 text-accent">
          <Icon className="h-4 w-4" />
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors" />
      </div>
      <p className="font-semibold mb-1">{title}</p>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </Link>
  );
}
