import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Lock } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Grupo GTOA — Backoffice corporativo" },
      {
        name: "description",
        content:
          "Acceso al backoffice de Grupo GTOA: ERP operativo y CRM comercial para Espacio Inmobiliario, Montenegro Design, Casa Diseño y GTOA.",
      },
      { property: "og:title", content: "Grupo GTOA — Backoffice corporativo" },
      {
        property: "og:description",
        content: "Punto de acceso al ERP y CRM de Grupo GTOA.",
      },
    ],
  }),
  component: LandingPage,
});

const brands = [
  "Espacio Inmobiliario",
  "Montenegro Design",
  "Casa Diseño",
  "GTOA",
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="px-8 py-6 flex items-center justify-between border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-primary text-primary-foreground grid place-items-center font-bold tracking-tight">
            G
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-wide">Grupo GTOA</p>
            <p className="text-xs text-muted-foreground">Backoffice corporativo</p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground hidden sm:block">
          Acceso interno
        </span>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-5xl">
          <div className="text-center mb-14">
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-4">
              Plataforma interna
            </p>
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight mb-5">
              Backoffice Grupo GTOA
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
              Un único punto de acceso para la operación, las ventas y la
              administración de nuestras marcas.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            <Link
              to="/erp"
              className="group relative rounded-xl border border-border bg-card p-8 transition-all hover:border-primary hover:shadow-lg"
            >
              <div className="flex items-start justify-between mb-8">
                <span className="text-[10px] uppercase tracking-widest text-primary font-semibold">
                  Disponible
                </span>
                <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">Ingresar al ERP</h2>
              <p className="text-sm text-muted-foreground">
                Gestión de pedidos, producción, ventas y facturación interna
                multi-marca.
              </p>
            </Link>

            <div
              aria-disabled="true"
              className="relative rounded-xl border border-dashed border-border bg-card/40 p-8 cursor-not-allowed"
            >
              <div className="flex items-start justify-between mb-8">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                  Próximamente
                </span>
                <Lock className="h-5 w-5 text-muted-foreground" />
              </div>
              <h2 className="text-2xl font-semibold mb-2 text-muted-foreground">
                Ingresar al CRM
              </h2>
              <p className="text-sm text-muted-foreground">
                Módulo comercial y de relación con clientes. Espacio reservado
                para próxima fase.
              </p>
            </div>
          </div>

          <div className="mt-16 text-center">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-3">
              Marcas operadas
            </p>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-foreground/80">
              {brands.map((b) => (
                <span key={b}>{b}</span>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="px-8 py-6 border-t border-border/60 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Grupo GTOA — Uso interno
      </footer>
    </div>
  );
}
