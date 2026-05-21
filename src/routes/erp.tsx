import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/erp")({
  head: () => ({
    meta: [
      { title: "ERP — Grupo GTOA" },
      {
        name: "description",
        content:
          "Módulo ERP de Grupo GTOA. Base lista para conexión con la base de datos; módulos operativos en construcción.",
      },
      { property: "og:title", content: "ERP — Grupo GTOA" },
      {
        property: "og:description",
        content: "Backoffice operativo de Grupo GTOA.",
      },
    ],
  }),
  component: ErpPlaceholder,
});

function ErpPlaceholder() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="px-8 py-6 border-b border-border/60 flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
        <p className="text-sm font-semibold tracking-wide">ERP · Grupo GTOA</p>
        <span className="text-xs text-muted-foreground hidden sm:block">
          Fase 0
        </span>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-xl text-center">
          <span className="inline-block text-[10px] uppercase tracking-[0.25em] text-primary font-semibold mb-5">
            Base lista
          </span>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-4">
            ERP en preparación
          </h1>
          <p className="text-muted-foreground mb-8">
            La estructura del proyecto está lista. Los módulos operativos
            (pedidos, producción, ventas, facturación interna multi-marca) se
            habilitarán por hitos una vez conectada la base de datos.
          </p>

          <div className="rounded-xl border border-border bg-card p-6 text-left">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
              Próximo hito
            </p>
            <p className="text-sm">
              <span className="font-semibold">Hito 1 —</span> Cimientos
              técnicos, autenticación interna y modelo multi-marca (Espacio
              Inmobiliario, Montenegro Design, Casa Diseño, GTOA).
            </p>
          </div>
        </div>
      </main>

      <footer className="px-8 py-6 border-t border-border/60 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Grupo GTOA — Uso interno
      </footer>
    </div>
  );
}
