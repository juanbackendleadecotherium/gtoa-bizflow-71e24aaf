import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Lock, Shield } from "lucide-react";
import espacioLogo from "@/assets/brands/espacio-mobiliario.png";
import casaLogo from "@/assets/brands/casa-diseno.png";
import montenegroLogo from "@/assets/brands/montenegro.webp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Grupo Getova — Backoffice corporativo" },
      {
        name: "description",
        content:
          "Acceso al backoffice de Grupo Getova: ERP operativo y CRM comercial para Espacio Inmobiliario, Montenegro Design, Casa Diseño y Getova.",
      },
      { property: "og:title", content: "Grupo Getova — Backoffice corporativo" },
      { property: "og:description", content: "Punto de acceso al ERP y CRM de Grupo Getova." },
    ],
  }),
  component: LandingPage,
});

type BrandItem = { name: string; logo?: string; token?: string };
const brands: BrandItem[] = [
  { name: "Espacio Mobiliario", logo: espacioLogo },
  { name: "Montenegro Design",  logo: montenegroLogo },
  { name: "Casa Diseño",        logo: casaLogo },
  { name: "Grupo Getova",       token: "bg-brand-getova" },
];


function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* fondo decorativo */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -right-32 h-[480px] w-[480px] rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute top-1/3 -left-40 h-[420px] w-[420px] rounded-full bg-primary/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <header className="px-6 sm:px-10 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground grid place-items-center font-display font-bold text-lg shadow-lg shadow-primary/20">
            G
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-wide">Grupo Getova</p>
            <p className="text-xs text-muted-foreground">Backoffice corporativo</p>
          </div>
        </div>
        <Link
          to="/auth"
          className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
        >
          <Shield className="h-3.5 w-3.5" />
          Iniciar sesión
        </Link>
      </header>

      <main className="px-6 sm:px-10 py-16 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 backdrop-blur px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              Plataforma interna
            </span>
            <h1 className="font-display text-5xl sm:text-6xl font-semibold tracking-tight mb-6">
              Operación de cuatro marcas,
              <br />
              <span className="text-accent">un solo backoffice.</span>
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
              Centralizamos pedidos, producción, ventas y facturación de las marcas de Grupo Getova en una sola plataforma.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            <Link
              to="/erp"
              className="group relative overflow-hidden rounded-2xl border border-border bg-surface p-8 transition-all hover:border-accent hover:shadow-xl hover:shadow-accent/10 hover:-translate-y-0.5"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-accent" />
              <div className="flex items-start justify-between mb-10">
                <span className="text-[10px] uppercase tracking-[0.22em] font-semibold text-accent">
                  Disponible
                </span>
                <ArrowRight className="h-5 w-5 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-accent" />
              </div>
              <h2 className="font-display text-2xl font-semibold mb-2">Ingresar al ERP</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Pedidos, flujo de producción, ventas, dashboard operativo y facturación interna multi-marca.
              </p>
            </Link>

            <div
              aria-disabled="true"
              className="relative overflow-hidden rounded-2xl border border-dashed border-border bg-surface/40 p-8 cursor-not-allowed"
            >
              <div className="flex items-start justify-between mb-10">
                <span className="text-[10px] uppercase tracking-[0.22em] font-semibold text-muted-foreground">
                  Próximamente
                </span>
                <Lock className="h-5 w-5 text-muted-foreground" />
              </div>
              <h2 className="font-display text-2xl font-semibold mb-2 text-muted-foreground">
                Ingresar al CRM
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Módulo comercial y de relación con clientes. Espacio reservado para próxima fase del contrato.
              </p>
            </div>
          </div>

          <div className="mt-20">
            <p className="text-center text-[11px] uppercase tracking-[0.25em] text-muted-foreground mb-6">
              Marcas operadas
            </p>
            <div className="flex flex-wrap justify-center items-center gap-4">
              {brands.map((b) =>
                b.logo ? (
                  <div
                    key={b.name}
                    className="flex items-center justify-center rounded-xl bg-white px-6 py-4 h-20 w-48 shadow-sm border border-border"
                  >
                    <img
                      src={b.logo}
                      alt={b.name}
                      className="max-h-12 max-w-full object-contain"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div
                    key={b.name}
                    className="flex items-center justify-center rounded-xl border border-dashed border-border bg-surface px-6 py-4 h-20 w-48 text-sm font-medium"
                  >
                    <span className={`h-2 w-2 rounded-full mr-2 ${b.token}`} />
                    {b.name}
                  </div>
                ),
              )}
            </div>
          </div>

        </div>
      </main>

      <footer className="px-6 sm:px-10 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Grupo Getova — Uso interno
      </footer>
    </div>
  );
}
