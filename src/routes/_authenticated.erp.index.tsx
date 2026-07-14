import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Settings, ArrowRight, Factory, ClipboardCheck, PackageCheck, AlertCircle, DollarSign, Users, TrendingUp, ListTodo, Wallet, Trophy, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { useSession } from "@/lib/use-session";
import { OverduePlanimetriesAdminAlert } from "@/features/seller-tasks/overdue-planimetries-admin-alert";
import { ownerForBrandSlug } from "@/features/production/brand-owners";

export const Route = createFileRoute("/_authenticated/erp/")({
  component: ErpDashboard,
});

function ErpDashboard() {
  const { brands, roles, isAdmin } = useBrand();

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

  // Rol Producción puro: dashboard operativo, no comercial
  const isProductionOnly = roles.includes("operativo") && !isAdmin && !roles.includes("ventas") && !roles.includes("vendedor") && !roles.includes("finanzas");
  if (isProductionOnly) return <ProductionDashboard />;

  // Vendedor puro: dashboard comercial personal
  const isSellerOnly = roles.includes("vendedor") && !isAdmin && !roles.includes("ventas") && !roles.includes("finanzas") && !roles.includes("operativo");
  if (isSellerOnly) return <SellerDashboard />;

  return <SalesDashboard />;
}

function SellerDashboard() {
  const { selectedBrand, selectedBrandId } = useBrand();
  const session = useSession();
  const userId = session.session?.user.id;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartISO = monthStart.toISOString();
  const monthLabel = monthStart.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  const periodMonth = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}-01`;

  const kpiQuery = useQuery({
    queryKey: ["seller-dashboard-kpis", userId, selectedBrandId, monthStartISO],
    enabled: !!userId && !!selectedBrandId,
    queryFn: async () => {
      // Ventas del mes en curso (monto total y cantidad)
      const { data: monthOrders } = await supabase
        .from("orders")
        .select("id,total")
        .eq("seller_id", userId!)
        .eq("brand_id", selectedBrandId!)
        .gte("created_at", monthStartISO);

      const monthCount = monthOrders?.length ?? 0;
      const monthAmount = (monthOrders ?? []).reduce((s, o: any) => s + Number(o.total ?? 0), 0);

      // Tareas pendientes (mis)
      const tasks = await supabase
        .from("seller_tasks")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", userId!)
        .eq("status", "pendiente");

      // Comisiones pendientes de aprobación o pago (mías)
      const commissionsPending = await supabase
        .from("commission_requests")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", userId!)
        .in("status", ["pendiente", "aprobada"]);

      // Meta del mes
      const { data: goal } = await supabase
        .from("sales_goals")
        .select("amount")
        .eq("seller_id", userId!)
        .eq("brand_id", selectedBrandId!)
        .eq("period_month", periodMonth)
        .maybeSingle();

      return {
        monthCount,
        monthAmount,
        pendingTasks: tasks.count ?? 0,
        pendingCommissions: commissionsPending.count ?? 0,
        goal: Number(goal?.amount ?? 0),
      };
    },
  });

  const recentOrdersQuery = useQuery({
    queryKey: ["seller-dashboard-recent", userId, selectedBrandId],
    enabled: !!userId && !!selectedBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, invoice_number, alegra_invoice_number, customer_name, total, created_at, sale_type")
        .eq("seller_id", userId!)
        .eq("brand_id", selectedBrandId!)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const commissionsMonthQuery = useQuery({
    queryKey: ["seller-dashboard-commissions-month", userId, selectedBrandId, periodMonth],
    enabled: !!userId && !!selectedBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commission_requests")
        .select("commission_amount, status")
        .eq("seller_id", userId!)
        .eq("brand_id", selectedBrandId!)
        .eq("period_month", periodMonth);
      if (error) throw error;
      const rows = data ?? [];
      const total = rows.reduce((s: number, r: any) => s + Number(r.commission_amount ?? 0), 0);
      const paid = rows.filter((r: any) => r.status === "pagada").reduce((s: number, r: any) => s + Number(r.commission_amount ?? 0), 0);
      const pending = total - paid;
      return { total, paid, pending };
    },
  });

  const goal = kpiQuery.data?.goal ?? 0;
  const monthAmount = kpiQuery.data?.monthAmount ?? 0;
  const goalPct = goal > 0 ? Math.min(100, Math.round((monthAmount / goal) * 100)) : null;

  return (
    <>
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-2">
          Mi panel · {selectedBrand?.name}
        </p>
        <h1 className="font-display text-3xl font-semibold mb-2">Panel del Vendedor</h1>
        <p className="text-muted-foreground capitalize">
          Resumen de tu actividad comercial en {monthLabel}.
        </p>
      </div>

      <div className="mb-6">
        <OverduePlanimetriesAdminAlert />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SellerKpi label="Ventas del mes" value={fmtMoney(monthAmount)} sub={`${kpiQuery.data?.monthCount ?? 0} ventas`} icon={TrendingUp} tone="emerald" to="/erp/orders" />
        <SellerKpi label="Tareas pendientes" value={kpiQuery.data?.pendingTasks ?? "—"} icon={ListTodo} tone="amber" to="/erp/my-tasks" />
        <SellerKpi label="Comisiones activas" value={kpiQuery.data?.pendingCommissions ?? "—"} sub="por aprobar/pagar" icon={Wallet} tone="blue" to="/erp/finance/commissions" />
        <SellerKpi label="Meta del mes" value={goal > 0 ? `${goalPct}%` : "Sin meta"} sub={goal > 0 ? fmtMoney(goal) : "Aún no asignada"} icon={Trophy} tone="violet" to="/erp/finance/goals" />
      </div>

      {goal > 0 && (
        <section className="mb-8 rounded-xl border border-violet-500/40 bg-violet-500/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold inline-flex items-center gap-2">
              <Trophy className="h-4 w-4 text-violet-600" /> Progreso de tu meta
            </h2>
            <p className="text-sm text-muted-foreground">{fmtMoney(monthAmount)} / {fmtMoney(goal)}</p>
          </div>
          <div className="w-full h-3 rounded-full bg-violet-500/15 overflow-hidden">
            <div className="h-full bg-violet-500 transition-all" style={{ width: `${goalPct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {goalPct! >= 100 ? "¡Meta cumplida! 🎉 Sigue vendiendo para tu bonificación." : `Te faltan ${fmtMoney(Math.max(0, goal - monthAmount))} para llegar a tu meta.`}
          </p>
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <section className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold inline-flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" /> Tus últimas ventas
            </h2>
            <Link to="/erp/orders" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">Ver todas <ArrowRight className="h-3 w-3" /></Link>
          </div>
          {recentOrdersQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : (recentOrdersQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no has registrado ventas en esta marca.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {recentOrdersQuery.data!.map((o: any) => (
                <li key={o.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {o.invoice_number ?? o.order_number ?? "Borrador"}
                      {o.customer_name && <span className="text-muted-foreground"> · {o.customer_name}</span>}
                    </p>
                    {o.alegra_invoice_number && (
                      <p className="text-[11px] text-muted-foreground">
                        Alegra: <span className="font-mono text-foreground">Fact. {o.alegra_invoice_number}</span>
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(o.created_at).toLocaleDateString("es-CO")} · {fmtMoney(Number(o.total ?? 0))}
                    </p>
                  </div>
                  <Link to="/erp/orders/$id" params={{ id: o.id }} className="text-xs text-primary inline-flex items-center gap-1 hover:underline shrink-0">
                    Abrir <ArrowRight className="h-3 w-3" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-5">
          <h2 className="font-semibold mb-3 inline-flex items-center gap-2">
            <Wallet className="h-4 w-4 text-emerald-600" /> Comisiones del mes
          </h2>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <MiniStat label="Generadas" value={fmtMoney(commissionsMonthQuery.data?.total ?? 0)} />
            <MiniStat label="Pagadas" value={fmtMoney(commissionsMonthQuery.data?.paid ?? 0)} accent="emerald" />
            <MiniStat label="Pendientes" value={fmtMoney(commissionsMonthQuery.data?.pending ?? 0)} accent="amber" />
          </div>
          <Link to="/erp/finance/commissions" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
            Ver detalle de comisiones <ArrowRight className="h-3 w-3" />
          </Link>
        </section>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <ActionCard to="/erp/orders" icon={Sparkles} title="Registrar nueva venta" desc="Crea una orden desde cero." />
        <ActionCard to="/erp/my-tasks" icon={ListTodo} title="Mis tareas" desc="Pendientes que te dejó producción o gerencia." />
        <ActionCard to="/erp/finance" icon={Wallet} title="Mis finanzas" desc="Aprobaciones, comisiones y cobros." />
      </div>
    </>
  );
}

function SellerKpi({ label, value, sub, icon: Icon, tone, to }: { label: string; value: string | number; sub?: string; icon: typeof Factory; tone: "amber" | "blue" | "violet" | "emerald"; to: string }) {
  const cls = {
    amber: "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300",
    blue: "border-blue-500/40 bg-blue-500/5 text-blue-700 dark:text-blue-300",
    violet: "border-violet-500/40 bg-violet-500/5 text-violet-700 dark:text-violet-300",
    emerald: "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
  }[tone];
  return (
    <Link to={to} className={`rounded-xl border p-4 hover:shadow-sm transition ${cls}`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className="h-4 w-4 opacity-80" />
        <ArrowRight className="h-3.5 w-3.5 opacity-60" />
      </div>
      <p className="text-[11px] uppercase tracking-[0.18em] opacity-80 mb-1">{label}</p>
      <p className="font-display text-2xl font-semibold truncate">{value}</p>
      {sub && <p className="text-[11px] opacity-70 mt-1 truncate">{sub}</p>}
    </Link>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: "emerald" | "amber" }) {
  const cls = accent === "emerald" ? "text-emerald-700 dark:text-emerald-300" : accent === "amber" ? "text-amber-700 dark:text-amber-300" : "";
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">{label}</p>
      <p className={`font-semibold text-sm ${cls}`}>{value}</p>
    </div>
  );
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n || 0);
}


function ProductionDashboard() {
  const { selectedBrand, selectedBrandId } = useBrand();
  const owner = ownerForBrandSlug(selectedBrand?.slug);

  const kpiQuery = useQuery({
    queryKey: ["prod-dashboard-kpis", selectedBrandId],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const base = () => supabase.from("production_orders").select("id", { count: "exact", head: true }).eq("brand_id", selectedBrandId!);
      const [pendiente, enProceso, calidad, listo] = await Promise.all([
        base().eq("status", "pendiente"),
        base().eq("status", "en_proceso"),
        base().eq("status", "control_calidad"),
        base().eq("status", "listo"),
      ]);
      return {
        pendiente: pendiente.count ?? 0,
        enProceso: enProceso.count ?? 0,
        calidad: calidad.count ?? 0,
        listo: listo.count ?? 0,
      };
    },
  });

  const pendingListQuery = useQuery({
    queryKey: ["prod-dashboard-pending-list", selectedBrandId],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_orders")
        .select("id, created_at, order_id, orders(order_number, invoice_number, customer_name)")
        .eq("brand_id", selectedBrandId!)
        .eq("status", "pendiente")
        .order("created_at", { ascending: true })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const novedadesQuery = useQuery({
    queryKey: ["prod-dashboard-novedades", selectedBrandId],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_orders")
        .select("id, novedad, novedad_note, order_id, orders(order_number, invoice_number, customer_name)")
        .eq("brand_id", selectedBrandId!)
        .not("novedad", "is", null)
        .neq("status", "entregado")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-2">
          Producción · {selectedBrand?.name}
        </p>
        <h1 className="font-display text-3xl font-semibold mb-2">Panel de Producción</h1>
        <p className="text-muted-foreground">
          {owner ? `Encargado de marca: ${owner}. ` : ""}Revisa las órdenes de producción de la marca activa y actúa sobre las que requieren tu atención.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <ProdKpi label="Por revisar" value={kpiQuery.data?.pendiente ?? "—"} icon={AlertCircle} tone="amber" to="/erp/production" />
        <ProdKpi label="En proceso" value={kpiQuery.data?.enProceso ?? "—"} icon={Factory} tone="blue" to="/erp/production" />
        <ProdKpi label="Control calidad" value={kpiQuery.data?.calidad ?? "—"} icon={ClipboardCheck} tone="violet" to="/erp/production" />
        <ProdKpi label="Listas para entrega" value={kpiQuery.data?.listo ?? "—"} icon={PackageCheck} tone="emerald" to="/erp/production" />
      </div>

      <section className="mb-8 rounded-xl border border-amber-500/40 bg-amber-500/5 p-5">
        <h2 className="font-semibold mb-3 inline-flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600" /> Requieren tu atención
        </h2>
        {pendingListQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (pendingListQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin órdenes pendientes de revisar. 🎉</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {pendingListQuery.data!.map((po: any) => (
              <li key={po.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    Venta {po.orders?.invoice_number ?? po.orders?.order_number ?? "—"}
                    {po.orders?.customer_name && <span className="text-muted-foreground"> · {po.orders.customer_name}</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Creada {new Date(po.created_at).toLocaleString("es-CO")}</p>
                </div>
                <Link to="/erp/production/$id" params={{ id: po.id }} className="text-xs text-primary inline-flex items-center gap-1 hover:underline shrink-0">
                  Revisar OP <ArrowRight className="h-3 w-3" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(novedadesQuery.data ?? []).length > 0 && (
        <section className="mb-8 rounded-xl border border-red-500/40 bg-red-500/5 p-5">
          <h2 className="font-semibold mb-3 inline-flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-600" /> Novedades activas
          </h2>
          <ul className="divide-y divide-border/60">
            {novedadesQuery.data!.map((po: any) => (
              <li key={po.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    Venta {po.orders?.invoice_number ?? po.orders?.order_number ?? "—"} · {po.novedad}
                  </p>
                  {po.novedad_note && <p className="text-[11px] text-muted-foreground truncate">{po.novedad_note}</p>}
                </div>
                <Link to="/erp/production/$id" params={{ id: po.id }} className="text-xs text-primary inline-flex items-center gap-1 hover:underline shrink-0">
                  Ver <ArrowRight className="h-3 w-3" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid sm:grid-cols-3 gap-4">
        <ActionCard to="/erp/production" icon={Factory} title="Ir a Producción" desc="Todas las OPs de la marca." />
        <ActionCard to="/erp/finance/supplier-payments" icon={DollarSign} title="Pagos a proveedores" desc="Anticipos y saldos pendientes." />
        <ActionCard to="/erp/settings/suppliers" icon={Users} title="Proveedores" desc="Directorio y datos de contacto." />
      </div>
    </>
  );
}

function ProdKpi({ label, value, icon: Icon, tone, to }: { label: string; value: string | number; icon: typeof Factory; tone: "amber" | "blue" | "violet" | "emerald"; to: string }) {
  const cls = {
    amber: "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300",
    blue: "border-blue-500/40 bg-blue-500/5 text-blue-700 dark:text-blue-300",
    violet: "border-violet-500/40 bg-violet-500/5 text-violet-700 dark:text-violet-300",
    emerald: "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
  }[tone];
  return (
    <Link to={to} className={`rounded-xl border p-4 hover:shadow-sm transition ${cls}`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className="h-4 w-4 opacity-80" />
        <ArrowRight className="h-3.5 w-3.5 opacity-60" />
      </div>
      <p className="text-[11px] uppercase tracking-[0.18em] opacity-80 mb-1">{label}</p>
      <p className="font-display text-2xl font-semibold">{value}</p>
    </Link>
  );
}

function SalesDashboard() {
  const { selectedBrand, selectedBrandId, isAdmin, roles } = useBrand();

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

      <div className="mb-6">
        <OverduePlanimetriesAdminAlert />
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
