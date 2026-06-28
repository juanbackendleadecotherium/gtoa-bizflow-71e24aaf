import { createFileRoute } from "@tanstack/react-router";
import { Truck } from "lucide-react";

import { useBrand } from "@/features/brands/brand-context";
import { useLogisticsRealtime } from "@/features/logistics/use-logistics-realtime";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PickupTable } from "@/features/logistics/pickup-table";
import { DriversPanel } from "@/features/logistics/drivers-panel";
import { AvailabilityCalendar } from "@/features/logistics/availability-calendar";

export const Route = createFileRoute("/_authenticated/erp/logistics/pickups")({
  head: () => ({ meta: [{ title: "Logística — Recogidas" }] }),
  component: LogisticsPickupsPage,
});

function LogisticsPickupsPage() {
  useLogisticsRealtime();
  const { roles, isAdmin, selectedBrandId } = useBrand();
  const isLogistics = isAdmin || roles.includes("logistica");

  if (!isLogistics) {
    return (
      <div className="rounded-xl border border-border p-10 text-center text-sm text-muted-foreground">
        Esta sección está disponible solo para el rol Logística.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Truck className="h-5 w-5" /> Logística — Recogidas
        </h1>
        <p className="text-sm text-muted-foreground">
          Gestiona las recogidas pendientes en los proveedores y el equipo de conductores.
        </p>
      </header>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Activas</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
          <TabsTrigger value="drivers">Conductores</TabsTrigger>
          <TabsTrigger value="availability">Disponibilidad</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <PickupTable
            statuses={["pendiente", "asignada", "en_camino", "recogida"]}
            canManage
            brandId={selectedBrandId}
          />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <PickupTable
            statuses={["entregada", "cancelada"]}
            canManage={false}
            brandId={selectedBrandId}
          />
        </TabsContent>
        <TabsContent value="drivers" className="mt-4">
          <DriversPanel canManage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
