import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, ClipboardList, Settings,
  LogOut, ChevronDown, Building2, ShieldCheck, ArrowLeft, Menu,
  FileText, Receipt, Wallet, Factory, BarChart3, Users, ListTodo, Boxes, UserCog, Database, Truck,
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { BrandProvider, useBrand } from "@/features/brands/brand-context";
import { useMyPendingTasksCount } from "@/features/seller-tasks/seller-tasks-panel";
import { countActivePickups } from "@/lib/pickup-orders.functions";
import { usePickupCountRealtime } from "@/features/logistics/use-logistics-realtime";

export const Route = createFileRoute("/_authenticated/erp")({
  head: () => ({
    meta: [
      { title: "ERP — Grupo Getova" },
      { name: "description", content: "Backoffice operativo de Grupo Getova." },
    ],
  }),
  component: ErpLayout,
});

function ErpLayout() {
  const session = useSession();
  const userId = session.session?.user.id;
  return (
    <BrandProvider userId={userId}>
      <Shell />
    </BrandProvider>
  );
}

type NavItem = {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  adminOnly?: boolean;
  logisticsOnly?: boolean;
};

const NAV: NavItem[] = [
  { label: "Dashboard", to: "/erp", icon: LayoutDashboard, exact: true },
  { label: "Ventas", to: "/erp/orders", icon: ClipboardList },
  { label: "Producción", to: "/erp/production", icon: Factory },
  { label: "Bodega", to: "/erp/warehouse", icon: Boxes },
  { label: "Logística", to: "/erp/logistics/pickups", icon: Truck, logisticsOnly: true },
  { label: "Gráficas ERP", to: "/erp/analytics", icon: BarChart3, adminOnly: true },
  { label: "Mis tareas", to: "/erp/my-tasks", icon: ListTodo },
  { label: "Finanzas", to: "/erp/finance", icon: Wallet, adminOnly: true },
  { label: "Estados", to: "/erp/settings/statuses", icon: Settings, adminOnly: true },
  { label: "Proveedores", to: "/erp/settings/suppliers", icon: Users, adminOnly: true },
  { label: "Bodegas y zonas", to: "/erp/settings/warehouses", icon: Building2, adminOnly: true },
  { label: "Datos fiscales", to: "/erp/settings/brand-billing", icon: Receipt, adminOnly: true },
  { label: "Términos de venta", to: "/erp/settings/terms", icon: FileText, adminOnly: true },
  { label: "Usuarios", to: "/erp/settings/users", icon: UserCog, adminOnly: true },
  { label: "Base de datos", to: "/erp/settings/database", icon: Database, adminOnly: true },
];

function Shell() {
  const session = useSession();
  const navigate = useNavigate();
  const userId = session.session?.user.id;
  const { brands, selectedBrand, setSelectedBrandId, isAdmin, roles } = useBrand();
  const isLogistics = isAdmin || roles.includes("logistica");
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);
  const pendingTasksQuery = useMyPendingTasksCount(userId);
  const pendingTasks = pendingTasksQuery.data ?? 0;

  usePickupCountRealtime();
  const pickupCountFn = useServerFn(countActivePickups);
  const pickupCountQuery = useQuery({
    queryKey: ["pickup-orders-count"],
    enabled: isLogistics,
    queryFn: () => pickupCountFn(),
  });
  const pickupCount = pickupCountQuery.data ?? 0;

  const profileQuery = useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles").select("user_id, email, display_name")
        .eq("user_id", userId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const profile = profileQuery.data;
  const initials = (profile?.display_name || profile?.email || "?")
    .split(/[\s@.]+/).filter(Boolean).slice(0, 2)
    .map((s) => s[0]?.toUpperCase()).join("");

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Sesión cerrada");
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <Link to="/" className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center font-display font-bold shadow-md">G</div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Grupo Getova</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/60">ERP</p>
            </div>
          </Link>
        </div>

        <div className="px-3 pt-3">
          <Link to="/" className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver al menú principal
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.filter((i) => (!i.adminOnly || isAdmin) && (!i.logisticsOnly || isLogistics)).map((item) => {
            const Icon = item.icon;
            const isActive = item.exact ? currentPath === item.to : currentPath.startsWith(item.to);
            const taskBadge = item.to === "/erp/my-tasks" && pendingTasks > 0 ? pendingTasks : 0;
            const pickupBadge = item.to === "/erp/logistics/pickups" && pickupCount > 0 ? pickupCount : 0;
            const badge = taskBadge || pickupBadge;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {badge > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold animate-pulse">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            <div className="h-8 w-8 rounded-full bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center text-xs font-semibold">
              {initials || "·"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile?.display_name || "Usuario"}</p>
              <p className="truncate text-[11px] text-sidebar-foreground/60">{profile?.email}</p>
            </div>
            <button onClick={handleSignOut} title="Cerrar sesión" className="rounded-md p-1.5 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-border bg-surface/60 backdrop-blur px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground hidden sm:block">Marca activa</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2" disabled={brands.length === 0}>
                  <Building2 className="h-3.5 w-3.5" />
                  {selectedBrand ? (
                    <>
                      <span className="h-2 w-2 rounded-full" style={{ background: selectedBrand.primary_color }} />
                      {selectedBrand.name}
                    </>
                  ) : ("Sin marca asignada")}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>Cambiar marca</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {brands.map((b) => (
                  <DropdownMenuItem key={b.id} onClick={() => setSelectedBrandId(b.id)} className="gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.primary_color }} />
                    <div className="flex-1">
                      <p className="text-sm">{b.name}</p>
                      <p className="text-[11px] text-muted-foreground">{b.legal_name}</p>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <Badge variant="outline" className="gap-1 border-accent/40 text-accent hidden sm:inline-flex">
                <ShieldCheck className="h-3 w-3" />Admin
              </Badge>
            )}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0 bg-sidebar text-sidebar-foreground border-sidebar-border">
                <SheetHeader className="px-5 py-5 border-b border-sidebar-border text-left">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center font-display font-bold shadow-md">G</div>
                    <div className="leading-tight">
                      <SheetTitle className="text-sm font-semibold text-sidebar-foreground">Grupo Getova</SheetTitle>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/60">ERP</p>
                    </div>
                  </div>
                </SheetHeader>

                <div className="px-3 pt-3">
                  <Link to="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 transition-colors">
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Volver al menú principal
                  </Link>
                </div>

                <nav className="px-3 py-4 space-y-1">
                  {NAV.filter((i) => (!i.adminOnly || isAdmin) && (!i.logisticsOnly || isLogistics)).map((item) => {
                    const Icon = item.icon;
                    const isActive = item.exact ? currentPath === item.to : currentPath.startsWith(item.to);
                    const taskBadge = item.to === "/erp/my-tasks" && pendingTasks > 0 ? pendingTasks : 0;
                    const pickupBadge = item.to === "/erp/logistics/pickups" && pickupCount > 0 ? pickupCount : 0;
                    const badge = taskBadge || pickupBadge;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="flex-1">{item.label}</span>
                        {badge > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold animate-pulse">
                            {badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </nav>

                <div className="mt-auto px-3 py-4 border-t border-sidebar-border">
                  <div className="flex items-center gap-3 rounded-md px-2 py-2">
                    <div className="h-8 w-8 rounded-full bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center text-xs font-semibold">
                      {initials || "·"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{profile?.display_name || "Usuario"}</p>
                      <p className="truncate text-[11px] text-sidebar-foreground/60">{profile?.email}</p>
                    </div>
                    <button onClick={() => { setMobileOpen(false); handleSignOut(); }} title="Cerrar sesión" className="rounded-md p-1.5 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60">
                      <LogOut className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <MainContainer />
      </div>
    </div>
  );
}

function MainContainer() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const wide = pathname.includes("/production/tracking");
  return (
    <main className={`flex-1 p-6 sm:p-8 w-full mx-auto ${wide ? "max-w-none" : "max-w-6xl"}`}>
      <Outlet />
    </main>
  );
}

