# Plan — Control de bodega por zonas (Logística)

## Decisiones clave (responde a tus 4 preguntas)

### 1. ¿Qué hay en cada zona "ahora"? → Cálculo en tiempo real desde `warehouse_movements`
No creo tabla derivada ni materialized view. Uso una **VIEW** `warehouse_item_locations` que para cada `item_id` devuelve el último movimiento (`DISTINCT ON (item_id) ... ORDER BY item_id, moved_at DESC, created_at DESC`) y su `zone_id` si el tipo es `in`, o `NULL` si el último es `out`. Sobre esa view armo `warehouse_zone_contents` (item actualmente en zona) y un `warehouse_zone_counts` para el resumen.

Razón: es el mismo patrón "fuente de verdad = log de eventos" que ya usas (status_history, audit_log). Evita drift, no necesita triggers de mantenimiento, y con índice `(item_id, moved_at DESC)` el costo es trivial para los volúmenes esperados. Realtime se logra suscribiéndose a `warehouse_movements` e invalidando las queries que leen la view (mismo patrón que ya usa producción tracking).

### 2. Panel de admin sin códigos de zona aún
Nueva ruta `/_authenticated/erp/settings/warehouses` (solo `admin`). Dos secciones:
- **Bodegas**: crear/editar/desactivar `warehouses` (name, address, active).
- **Zonas** (dentro de cada bodega): tabla con crear/editar/desactivar `warehouse_zones` (zone_code, description, capacity_units). Vacía al inicio. **No siembro ningún dato** — solo un empty state que dice "Aún no hay zonas. Crea la primera cuando tengas los códigos definidos."

No bloqueo el resto de la UI por falta de zonas: la vista operativa también muestra empty state cuando no hay zonas creadas.

### 3. Salida sin ingreso previo
**Bloqueo en la base de datos** vía trigger `BEFORE INSERT` en `warehouse_movements`. Reglas:
- Si `movement_type = 'in'` y el ítem ya tiene una ubicación activa (último movimiento es `in` sin `out` posterior) → `RAISE EXCEPTION` "Este producto ya está en bodega ({zona}). Registra primero la salida."
- Si `movement_type = 'out'` y el ítem no tiene ubicación activa → `RAISE EXCEPTION` "Este producto no está actualmente en bodega; no se puede registrar una salida."
- Si `movement_type = 'out'` y `zone_id` no coincide con la ubicación actual → `RAISE EXCEPTION` "El producto está en la zona X, no en la zona indicada."

Mismo patrón que `require_planimetry_for_production` / `prevent_reassign_active_production_item`. El error sube a la UI vía el server function y se muestra con `toast.error(error.message)`.

### 4. Archivos a crear/modificar

**Migración SQL** (1 archivo nuevo):
- 3 tablas + GRANTs + RLS + políticas
- View `warehouse_item_locations`
- Trigger de validación de movimientos
- Trigger `set_warehouse_movement_creator` (rellena `moved_by`)
- `ALTER PUBLICATION supabase_realtime ADD TABLE warehouse_movements`

**Server functions** (`src/lib/warehouse.functions.ts`, nuevo):
- `listWarehousesWithZones()` — admin + operativo
- `upsertWarehouse({...})` — admin
- `upsertWarehouseZone({...})` — admin
- `deactivateWarehouseZone(id)` — admin
- `listZoneSummary()` — bodega resumen (zona + count + capacity)
- `listZoneContents(zoneId)` — items en una zona
- `listFinishedItemsAvailableForIntake()` — items en estado `terminado` sin ubicación activa
- `listItemsInWarehouse()` — items con ubicación activa (para salida)
- `registerWarehouseMovement({...})` — `in` u `out`, valida vía trigger DB

Todas con `requireSupabaseAuth`. Las de escritura chequean `has_role('admin')` o `has_role('operativo')` según corresponda.

**Rutas/componentes nuevos**:
- `src/routes/_authenticated.erp.settings.warehouses.tsx` — panel admin (bodegas + zonas)
- `src/routes/_authenticated.erp.warehouse.tsx` — vista operativa con tres tabs: **Resumen por zona**, **Registrar ingreso**, **Registrar salida**
- `src/features/warehouse/zone-summary.tsx` — grid de zonas con conteo/capacidad y drawer con contenido
- `src/features/warehouse/intake-form.tsx`
- `src/features/warehouse/dispatch-form.tsx`
- `src/features/warehouse/use-warehouse-realtime.ts` — hook con suscripción a `warehouse_movements` que invalida queries

**Modificaciones mínimas**:
- `src/routes/_authenticated.erp.tsx` — agregar item de nav "Bodega" → `/erp/warehouse`
- `src/routes/_authenticated.erp.settings.*` — agregar link a "Bodegas y zonas" en la nav de settings

## Detalles técnicos

### Roles
El enum `app_role` actual es `('admin','operativo','finanzas','ventas')`. **No existen roles separados "producción" y "logística"**; el módulo operativo entero (incluyendo seguimiento de producción y logística) usa `operativo` hoy. Por consistencia con el resto del proyecto:
- **Lectura** de las 3 tablas: `admin` o `operativo`.
- **Inserción** en `warehouse_movements`: `admin` o `operativo`.
- **Mantenimiento** de `warehouses` / `warehouse_zones`: solo `admin`.

Si en el futuro quieres separar logística de producción, se hace ampliando el enum y los policies; no afecta el esquema.

### Esquema SQL (resumen)

```sql
CREATE TABLE public.warehouses (
  id uuid PK, name text NOT NULL, address text, active boolean DEFAULT true,
  created_at, updated_at
);

CREATE TABLE public.warehouse_zones (
  id uuid PK, warehouse_id uuid FK,
  zone_code text NOT NULL, description text, capacity_units int,
  active boolean DEFAULT true,
  UNIQUE (warehouse_id, zone_code)
);

CREATE TABLE public.warehouse_movements (
  id uuid PK,
  item_id uuid FK -> order_items(id),
  zone_id uuid FK -> warehouse_zones(id),
  movement_type text CHECK (in ('in','out')),
  moved_at timestamptz DEFAULT now(),
  moved_by uuid, moved_by_email text,
  reason text,
  client_invoice text, client_cedula text,   -- requeridos cuando out + motivo=entrega
  product_quantity numeric DEFAULT 1
);
CREATE INDEX ON warehouse_movements (item_id, moved_at DESC);
```

GRANTs explícitos `authenticated`/`service_role` en las tres; RLS habilitada; policies vía `has_role()`.

### View de ubicación actual

```sql
CREATE VIEW public.warehouse_item_locations AS
SELECT DISTINCT ON (item_id)
  item_id,
  CASE WHEN movement_type = 'in' THEN zone_id END AS current_zone_id,
  moved_at AS last_movement_at,
  movement_type AS last_movement_type
FROM warehouse_movements
ORDER BY item_id, moved_at DESC, created_at DESC;
```

### Cambio de proveedor / re-ingreso
Si un ítem sale y vuelve a entrar (ej. devolución → reingreso a otra zona), es válido: el log es la verdad. La restricción solo impide dos `in` consecutivos sin un `out` intermedio.

### Realtime
Hook `useWarehouseRealtime()` se suscribe en la ruta `/erp/warehouse` y en el panel admin:
```ts
supabase.channel('warehouse_movements')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_movements' },
      () => queryClient.invalidateQueries({ queryKey: ['warehouse'] }))
  .subscribe()
```
Cleanup en el `return` del `useEffect`.

## Fuera de alcance (confirmar si lo quieres en una siguiente iteración)
- Traslados entre zonas como movimiento atómico único (hoy = `out` + `in`).
- Adjuntar fotos del producto al ingresar.
- Reporte histórico de movimientos por ítem (es trivial agregarlo después leyendo `warehouse_movements`).
