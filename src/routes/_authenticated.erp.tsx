import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Package,
  Factory,
  ShoppingCart,
  Receipt,
  History,
  Users,
  LogOut,
  ChevronDown,
  Building2,
  ShieldCheck,
  Loader2,
  Construction,
  ArrowLeft,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/erp")({
  head: () => ({
    meta: [
      { title: "ERP — Grupo Getova" },
      { name: "description", content: "Backoffice operativo de Grupo Getova." },
    ],
  }),
  component: ErpDashboard,
});

type Brand = {
  id: string;
  slug: string;
  name: string;
  legal_name: string | null;
  primary_color: string;
  is_active: boolean;
};

type Profile = {
  user_id: string;
  email: string | null;
  display_name: string | null;
};

type RoleRow = { role: "admin" | "operativo" | "finanzas" | "ventas" };

const SELECTED_BRAND_KEY = "getova:selected-brand";

const NAV = [
  { label: "Dashboard", icon: LayoutDashboard, key: "dashboard", ready: true },
  { label: "Pedidos", icon: Package, key: "orders" },
  { label: "Producción", icon: Factory, key: "production" },
  { label: "Ventas", icon: ShoppingCart, key: "sales" },
  { label: "Facturación", icon: Receipt, key: "billing" },
  { label: "Historial", icon: History, key: "history" },
  { label: "Equipo", icon: Users, key: "team", adminOnly: true },
];

function ErpDashboard() {
  const session = useSession();
  const navigate = useNavigate();
  const userId = session.session?.user.id;

  const profileQuery = useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, email, display_name")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const rolesQuery = useQuery({
    queryKey: ["roles", userId],
    enabled: !!userId,
    queryFn: async (): Promise<RoleRow[]> => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const isAdmin = useMemo(
    () => rolesQuery.data?.some((r) => r.role === "admin") ?? false,
    [rolesQuery.data],
  );

  // Marcas: admin ve todas; otros usuarios solo las asignadas (RLS las filtra vía user_brands -> brands join no es trivial sin RPC; hacemos dos consultas).
  const brandsQuery = useQuery({
    queryKey: ["brands", userId, isAdmin],
    enabled: !!userId && !rolesQuery.isLoading,
    queryFn: async (): Promise<Brand[]> => {
      if (isAdmin) {
        const { data, error } = await supabase
          .from("brands")
          .select("id, slug, name, legal_name, primary_color, is_active")
          .order("name");
        if (error) throw error;
        return data ?? [];
      }
      const { data: assignments, error: aErr } = await supabase
        .from("user_brands")
        .select("brand_id")
        .eq("user_id", userId!);
      if (aErr) throw aErr;
      const ids = (assignments ?? []).map((a) => a.brand_id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("brands")
        .select("id, slug, name, legal_name, primary_color, is_active")
        .in("id", ids)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const brands = brandsQuery.data ?? [];

  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);

  useEffect(() => {
    if (brands.length === 0) return;
    const stored = typeof window !== "undefined" ? localStorage.getItem(SELECTED_BRAND_KEY) : null;
    const exists = stored && brands.find((b) => b.id === stored);
    setSelectedBrandId(exists ? stored! : brands[0].id);
  }, [brands]);

  useEffect(() => {
    if (selectedBrandId && typeof window !== "undefined") {
      localStorage.setItem(SELECTED_BRAND_KEY, selectedBrandId);
    }
  }, [selectedBrandId]);

  const selectedBrand = brands.find((b) => b.id === selectedBrandId) ?? null;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Sesión cerrada");
    navigate({ to: "/" });
  };

  const profile = profileQuery.data;
  const initials = (profile?.display_name || profile?.email || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  const loading = profileQuery.isLoading || rolesQuery.isLoading || brandsQuery.isLoading;

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <Link to="/" className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center font-display font-bold shadow-md">
              G
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Grupo GTOA</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/60">ERP</p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.filter((i) => !i.adminOnly || isAdmin).map((item) => {
            const Icon = item.icon;
            const isActive = item.ready;
            return (
              <button
                key={item.key}
                disabled={!item.ready}
                className={`w-full flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent/40 cursor-not-allowed"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-4 w-4" />
                  {item.label}
                </span>
                {!item.ready && (
                  <span className="text-[9px] uppercase tracking-wider opacity-70">pronto</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            <div className="h-8 w-8 rounded-full bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center text-xs font-semibold">
              {initials || "·"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {profile?.display_name || "Usuario"}
              </p>
              <p className="truncate text-[11px] text-sidebar-foreground/60">
                {profile?.email}
              </p>
            </div>
            <button
              onClick={handleSignOut}
              title="Cerrar sesión"
              className="rounded-md p-1.5 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="border-b border-border bg-surface/60 backdrop-blur px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Marca activa</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2" disabled={brands.length === 0}>
                  <Building2 className="h-3.5 w-3.5" />
                  {selectedBrand ? (
                    <>
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: selectedBrand.primary_color }}
                      />
                      {selectedBrand.name}
                    </>
                  ) : (
                    "Sin marca asignada"
                  )}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>Cambiar marca</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {brands.map((b) => (
                  <DropdownMenuItem
                    key={b.id}
                    onClick={() => setSelectedBrandId(b.id)}
                    className="gap-2"
                  >
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
              <Badge variant="outline" className="gap-1 border-accent/40 text-accent">
                <ShieldCheck className="h-3 w-3" />
                Admin
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="md:hidden">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-6 sm:p-8 max-w-6xl w-full mx-auto">
          {loading ? (
            <div className="grid place-items-center h-64 text-sm text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Cargando datos del backoffice…
            </div>
          ) : (
            <>
              <div className="mb-8">
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-2">
                  Hito 1 · Cimientos
                </p>
                <h1 className="font-display text-3xl font-semibold mb-2">
                  Hola, {profile?.display_name || "operador"} 👋
                </h1>
                <p className="text-muted-foreground">
                  Base del ERP lista. Los módulos operativos se irán habilitando por hitos.
                </p>
              </div>

              {/* Resumen */}
              <div className="grid sm:grid-cols-3 gap-4 mb-8">
                <SummaryCard
                  label="Tu rol"
                  value={
                    rolesQuery.data && rolesQuery.data.length > 0
                      ? rolesQuery.data.map((r) => r.role).join(", ")
                      : "Sin rol asignado"
                  }
                  tone={rolesQuery.data && rolesQuery.data.length > 0 ? "accent" : "muted"}
                />
                <SummaryCard
                  label="Marcas disponibles"
                  value={`${brands.length} de 4`}
                  tone="accent"
                />
                <SummaryCard
                  label="Marca activa"
                  value={selectedBrand?.name ?? "—"}
                  tone="default"
                />
              </div>

              {/* Sin acceso */}
              {brands.length === 0 && (
                <div className="rounded-xl border border-dashed border-border bg-surface p-6 mb-8">
                  <p className="font-medium mb-1">Aún no tienes marcas asignadas</p>
                  <p className="text-sm text-muted-foreground">
                    Un administrador debe asignarte acceso a una o más marcas desde la tabla{" "}
                    <code className="text-xs">user_brands</code>.
                  </p>
                </div>
              )}

              {/* Marcas */}
              <section className="mb-10">
                <h2 className="font-display text-lg font-semibold mb-3">Marcas operadas</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {brands.map((b) => {
                    const active = b.id === selectedBrandId;
                    return (
                      <button
                        key={b.id}
                        onClick={() => setSelectedBrandId(b.id)}
                        className={`text-left rounded-xl border bg-surface p-4 transition-all hover:-translate-y-0.5 hover:shadow-md ${
                          active ? "border-accent shadow-sm" : "border-border"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span
                            className="h-6 w-6 rounded-md"
                            style={{ background: b.primary_color }}
                          />
                          {active && (
                            <span className="text-[10px] uppercase tracking-wider text-accent font-semibold">
                              activa
                            </span>
                          )}
                        </div>
                        <p className="font-semibold">{b.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {b.legal_name}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Próximos hitos */}
              <section>
                <h2 className="font-display text-lg font-semibold mb-3">Próximos módulos</h2>
                <div className="rounded-xl border border-border bg-surface p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="rounded-md bg-accent/15 p-2 text-accent">
                      <Construction className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">Roadmap operativo</p>
                      <p className="text-sm text-muted-foreground">
                        Se habilitarán según el orden del contrato.
                      </p>
                    </div>
                  </div>
                  <ol className="space-y-2 text-sm">
                    <RoadmapItem n={2} title="Gestión de pedidos" />
                    <RoadmapItem n={3} title="Flujo de producción y seguimiento" />
                    <RoadmapItem n={4} title="Dashboard operativo" />
                    <RoadmapItem n={5} title="Ventas y gestión financiera básica" />
                    <RoadmapItem n={6} title="Facturación interna personalizada por marca" />
                    <RoadmapItem n={7} title="Organización de producción e historial" />
                  </ol>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent" | "muted";
}) {
  const toneClass =
    tone === "accent"
      ? "border-accent/30 bg-accent/5"
      : tone === "muted"
      ? "border-dashed"
      : "";
  return (
    <div className={`rounded-xl border bg-surface p-5 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
        {label}
      </p>
      <p className="font-display text-lg font-semibold capitalize truncate">{value}</p>
    </div>
  );
}

function RoadmapItem({ n, title }: { n: number; title: string }) {
  return (
    <li className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/40">
      <span className="grid place-items-center h-6 w-6 rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
        {n}
      </span>
      <span className="flex-1">{title}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Hito {n}</span>
    </li>
  );
}
