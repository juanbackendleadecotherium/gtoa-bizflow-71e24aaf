import { createFileRoute, Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Wallet, Trophy, Trash2, Loader2, Target, DollarSign, FileText, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { useBrand } from "@/features/brands/brand-context";

export const Route = createFileRoute("/_authenticated/erp/finance")({
  head: () => ({ meta: [{ title: "Finanzas — Grupo Getova" }] }),
  component: FinanceLayout,
});

type TabDef = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; roles: Array<"admin" | "vendedor" | "ventas"> };

const TABS: TabDef[] = [
  { to: "/erp/finance", label: "Resumen", icon: LayoutDashboard, exact: true, roles: ["admin"] },
  { to: "/erp/finance/receivables", label: "Cartera por cobrar", icon: Wallet, roles: ["admin"] },
  { to: "/erp/finance/treasury", label: "Tesorería", icon: FileText, roles: ["admin"] },
  { to: "/erp/finance/approvals", label: "Aprobaciones", icon: ShieldCheck, roles: ["admin"] },
  { to: "/erp/finance/goals", label: "Metas de ventas", icon: Target, roles: ["admin"] },
  { to: "/erp/finance/commissions", label: "Comisiones", icon: DollarSign, roles: ["admin", "vendedor", "ventas"] },
  { to: "/erp/finance/sellers", label: "Rendimiento por vendedor", icon: Trophy, roles: ["admin"] },
  { to: "/erp/finance/deletions", label: "Eliminaciones", icon: Trash2, roles: ["admin"] },
];

function FinanceLayout() {
  const { isAdmin, roles, loading } = useBrand();
  const isSalesRole = roles.includes("vendedor") || roles.includes("ventas");
  const canAccess = isAdmin || isSalesRole;
  const navigate = useNavigate();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  useEffect(() => {
    if (loading) return;
    if (!canAccess) {
      navigate({ to: "/erp", replace: true });
      return;
    }
    // Comercial puro: redirigir index y rutas admin-only a Comisiones.
    if (!isAdmin && isSalesRole) {
      const allowed = TABS.filter((t) => t.roles.some((role) => roles.includes(role)));
      const isOnAllowed = allowed.some((t) => (t.exact ? currentPath === t.to : currentPath.startsWith(t.to)));
      if (!isOnAllowed) {
        navigate({ to: "/erp/finance/commissions", replace: true });
      }
    }
  }, [loading, canAccess, isAdmin, isSalesRole, roles, currentPath, navigate]);

  if (loading || !canAccess) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const visibleTabs = TABS.filter((t) => (isAdmin ? true : t.roles.some((role) => roles.includes(role))));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Finanzas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Seguimiento financiero de ventas, cartera y rendimiento del equipo comercial.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {visibleTabs.map((t) => {
          const Icon = t.icon;
          const active = t.exact ? currentPath === t.to : currentPath.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap ${
                active
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />{t.label}
            </Link>
          );
        })}
      </div>

      <Outlet />
    </div>
  );
}
