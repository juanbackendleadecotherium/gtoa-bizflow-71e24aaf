import { createFileRoute, Link, Outlet, useRouterState, Navigate } from "@tanstack/react-router";
import { LayoutDashboard, Wallet, Trophy, Loader2 } from "lucide-react";
import { useBrand } from "@/features/brands/brand-context";

export const Route = createFileRoute("/_authenticated/erp/finance")({
  head: () => ({ meta: [{ title: "Finanzas — Grupo Getova" }] }),
  component: FinanceLayout,
});

const TABS = [
  { to: "/erp/finance", label: "Resumen", icon: LayoutDashboard, exact: true },
  { to: "/erp/finance/receivables", label: "Cartera por cobrar", icon: Wallet },
  { to: "/erp/finance/sellers", label: "Rendimiento por vendedor", icon: Trophy },
];

function FinanceLayout() {
  const { isAdmin, loading } = useBrand();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  if (loading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (!isAdmin) return <Navigate to="/erp" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Finanzas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Seguimiento financiero de ventas, cartera y rendimiento del equipo comercial.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.exact ? currentPath === t.to : currentPath.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap ${
                active
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />{t.label}
            </Link>
          );
        })}
      </div>

      <Outlet />
    </div>
  );
}
