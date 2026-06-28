# Módulo Logística — Recogidas por ítem terminado

Construye un flujo nuevo que se dispara **cuando un `order_item` se marca como terminado** (no cuando la factura entera pasa a "pendiente por logística"). Cada ítem genera su propia orden de recogida, gestionada por un nuevo rol `logistica`.

---

## 1. Modelo de datos

### Nuevo rol `logistica`
El enum `app_role` actual es `('admin','operativo','finanzas','ventas','vendedor')` — **no existe** `logistica`. Migración:
- `ALTER TYPE app_role ADD VALUE 'logistica'`.
- Actualizar `can_finish_order_item`, vistas de tareas y sidebar para reconocerlo.

### Tabla `drivers`
Campos: `id`, `brand_id` (nullable — los conductores son compartidos), `full_name`, `phone`, `vehicle_label` (texto: "Camión propio NRX-123" o "Externo — moto de Carlos"), `vehicle_type` enum `('propio','externo')`, `availability` enum `('disponible','en_ruta','no_disponible')`, `notes`, `active bool default true`, timestamps.
- RLS: SELECT para `authenticated`; INSERT/UPDATE/DELETE solo `admin` o `logistica` (`has_role`).
- GRANTs explícitos a `authenticated` y `service_role`.
- Realtime habilitado.

### Tabla `pickup_orders`
Campos:
- `id`, `order_item_id` (FK único — un ítem = una recogida), `order_id`, `brand_id`, `production_order_id`.
- `supplier_id`, `supplier_name_snapshot`, `pickup_address_snapshot` (copiada de `suppliers.address` al crearse).
- `destination` enum `('bodega','cliente')` (default `bodega` — se puede editar antes de asignar).
- `destination_warehouse_id` nullable, `destination_address_snapshot` nullable (cliente).
- `product_description_snapshot`.
- `status` enum `('pendiente','asignada','en_camino','recogida','entregada','cancelada')`.
- `driver_id` nullable FK a `drivers`.
- `assigned_at`, `picked_up_at`, `delivered_at`, `cancelled_at`, `cancel_reason`.
- **Costo logístico externo**: `external_transport_cost numeric(14,2)` + `external_transport_notes text` + `external_transport_currency` (`COP` default). Solo se exige cuando `driver.vehicle_type='externo'` al marcar `entregada`. Esta misma forma (`external_transport_cost` en la tabla operativa del evento + función `sum_external_logistics_cost(_from,_to,_brand)`) queda disponible para el KPI ejecutivo y para futuros módulos de entregas (reutilizable).
- `created_by`, `created_by_email`, timestamps.
- RLS: SELECT para `logistica`, `admin`, y el vendedor del `order_id` (vía join). UPDATE solo `logistica`/`admin`. INSERT vía trigger (security definer).
- GRANTs + Realtime.

### Auto-creación
Trigger `AFTER UPDATE OF production_finished_at ON order_items`: cuando pasa a `NOT NULL`, insertar `pickup_orders` (idempotente por `order_item_id` único). Al mismo tiempo crear un `seller_tasks` tipo nuevo `logistics_pickup_ready` dirigido a usuarios con rol `logistica` (severity `info`) — reutilizamos el patrón de tarea existente, solo agregamos un type nuevo y mostramos el badge en sidebar para esos usuarios.

Nota: la tarea de logística va a una "bandeja" del rol, no a un seller_id individual. Para esto añadimos columna nullable `assignee_role app_role` en `seller_tasks` (la consulta de badge para `logistica` filtra por `assignee_role='logistica'`). No rompe la lógica del vendedor (sigue usando `seller_id`).

---

## 2. UI / Rutas

### `/erp/logistics/pickups` (rol `logistica` + `admin`)
Layout con tabs:
- **Pendientes** (default): tabla con producto, proveedor, dirección recogida, destino, fecha solicitada, estado, conductor asignado. Acciones inline: Asignar conductor → Marcar en camino → Recogida → Entregada. Filtros por marca, estado, proveedor.
- **Conductores**: CRUD de `drivers` + toggle rápido de `availability`. Realtime. Al abrir el selector "Asignar conductor" en una orden, se ven badges de disponibilidad y se desactivan los que no estén `disponible`.
- **Historial** (mes actual, filtrable por rango y marca): recogidas `entregada` o `cancelada`, con costo externo cuando aplica, total acumulado de costos externos arriba.

### Integración con bodega
Al marcar `entregada` con `destination='bodega'`, mostrar toast con acción **"Registrar ingreso a bodega"** que navega a `/erp/warehouse?tab=intake&prefill_item={id}`. Ajuste mínimo en `IntakeForm` existente: leer ese query param y pre-seleccionar el ítem. **No** se crea un formulario nuevo.

### Sidebar
Añadir entry "Logística" en `_authenticated.erp.tsx` visible cuando `has_role(logistica)` o `admin`. Badge con count de `pickup_orders` en estado `pendiente`/`asignada` (mismo patrón de `useMyPendingTasksCount`).

---

## 3. Server functions (`createServerFn` + `requireSupabaseAuth`)

`src/lib/pickup-orders.functions.ts`:
- `listPickupOrders({ status?, brandId? })`
- `assignDriver({ pickupId, driverId })` — valida disponibilidad, marca driver `en_ruta`.
- `updatePickupStatus({ pickupId, status, externalCost?, externalNotes? })` — al pasar a `entregada` libera al driver (`disponible`) y exige costo si vehículo `externo`.
- `cancelPickup({ pickupId, reason })`.

`src/lib/drivers.functions.ts`:
- `listDrivers`, `upsertDriver`, `setDriverAvailability`, `deactivateDriver`.

Todas con verificación `has_role(logistica|admin)` dentro del handler.

---

## 4. Usuario de Jonathan

Pasos exactos (usa el panel admin que **ya existe** en este proyecto, no Supabase directo):

1. Aplicar la migración (agrega rol `logistica` al enum).
2. Iniciar sesión como admin → `/erp/settings/users`.
3. Click **"Crear usuario"** → email de Jonathan + contraseña temporal + display name. Esto llama `createUserAccount` (admin API) que ya crea el `profiles`.
4. En la fila de Jonathan, abrir **Roles** y asignar `logistica`. (El panel ya soporta multi-rol vía `user_roles`.)
5. En **Marcas**, asignar las marcas en las que operará (Jonathan necesita ver pickups de todas las marcas que opere → asignar las 4 si aplica).
6. Compartir credenciales y pedirle cambiar contraseña en el primer login.

No se requiere tocar Supabase Auth directamente.

---

## 5. KPI de costos logísticos externos (reutilizable)

- Función SQL `sum_external_logistics_cost(_from date, _to date, _brand_id uuid default null)` que suma `external_transport_cost` de `pickup_orders` entregadas en el rango. Cuando exista módulo de entregas a cliente con su propia tabla, se extiende la función a un `UNION ALL` — la forma del API no cambia.
- El dashboard ejecutivo de bodega ya tiene patrón de tarjetas; se agrega una tarjeta "Costos logísticos externos (mes)" llamando esa función. (Fuera del scope de implementación inicial — dejar la función creada y documentada.)

---

## Archivos a crear / modificar

**Migración nueva** (una sola, atómica):
- Enum `logistica`, tablas `drivers` + `pickup_orders` con RLS/GRANTs/Realtime, columna `assignee_role` en `seller_tasks`, trigger `auto_create_pickup_on_item_finished`, función `sum_external_logistics_cost`.

**Código**:
- `src/lib/pickup-orders.functions.ts` (nuevo)
- `src/lib/drivers.functions.ts` (nuevo)
- `src/routes/_authenticated.erp.logistics.tsx` (layout)
- `src/routes/_authenticated.erp.logistics.pickups.tsx` (bandeja con tabs)
- `src/features/logistics/pickup-table.tsx`, `assign-driver-dialog.tsx`, `update-status-dialog.tsx`, `drivers-panel.tsx`, `pickup-history.tsx` (nuevos)
- `src/features/logistics/use-pickups-realtime.ts`, `use-drivers-realtime.ts` (nuevos)
- `src/routes/_authenticated.erp.tsx` — agregar item de nav "Logística" + badge.
- `src/routes/_authenticated.erp.warehouse.tsx` — `IntakeForm` lee `prefill_item` del search.
- `src/features/production/finish-item-button.tsx` — toast post-éxito menciona "Se creó orden de recogida".
- `src/features/brands/brand-context.tsx` / `useBrand` — exponer `isLogistica`.

¿Apruebas para implementar?
