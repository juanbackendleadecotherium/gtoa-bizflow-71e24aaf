import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, LineChart, PieChart, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/erp/analytics")({
  head: () => ({ meta: [{ title: "Gráficas ERP — Grupo Getova" }] }),
  component: AnalyticsPlaceholder,
});

function AnalyticsPlaceholder() {
  const cards = [
    { icon: TrendingUp, title: "Ventas por marca", desc: "Tendencia mensual, ticket promedio, top vendedores." },
    { icon: PieChart, title: "Mix de novedades", desc: "Distribución de órdenes de producción por estado." },
    { icon: LineChart, title: "Margen real", desc: "Costos vs. precio de venta por proveedor y marca." },
    { icon: BarChart3, title: "Cobranza", desc: "Cartera por edades, pagos del mes, recaudos vencidos." },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold">Gráficas ERP</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Panel administrativo con métricas y gráficas del ERP. En construcción.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-border bg-surface/40 p-8 text-center">
        <p className="text-sm font-medium">Pronto encontrarás aquí los indicadores clave del negocio.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Esta sección reemplaza "Producción Real" y se irá llenando con las gráficas que definamos juntos.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {cards.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="rounded-xl border border-border bg-surface p-4 opacity-70">
            <div className="flex items-center gap-2 mb-2">
              <Icon className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">{title}</h3>
              <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                Próximamente
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
