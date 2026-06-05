import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Factory, Truck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/erp/real-production")({
  head: () => ({ meta: [{ title: "Producción Real — Grupo Getova" }] }),
  component: RealProductionLayout,
});

function RealProductionLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const onLog = path.includes("/real-production/logistica");
  const onProd = path.includes("/real-production/produccion");
  const onDetail = !onLog && !onProd && /\/real-production\/[^/]+$/.test(path) && !path.endsWith("/real-production");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
          <Factory className="h-5 w-5 text-primary" /> Producción Real
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Flujo completo: planimetría, proveedor, negociación, seguimiento, control de calidad y entrega.
        </p>
      </div>

      {!onDetail && (
        <div className="inline-flex rounded-xl border border-border bg-surface p-1 gap-1">
          <Tab to="/erp/real-production/produccion" active={onProd || (!onLog && !onDetail)} icon={Factory} label="Producción" />
          <Tab to="/erp/real-production/logistica" active={onLog} icon={Truck} label="Logística" />
        </div>
      )}

      <Outlet />
    </div>
  );
}

function Tab({ to, active, icon: Icon, label }: { to: string; active: boolean; icon: typeof Factory; label: string }) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </Link>
  );
}
