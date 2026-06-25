## Dashboard ejecutivo de inventario en bodega

Vista de solo consulta para producción y logística, sobre los datos que ya existen en `warehouse_movements`, `warehouse_zones`, `warehouses`, `orders` y `order_items`. No crea ni modifica movimientos.

---

### Decisión 1 — Origen de factura y cédula del cliente

**Recomendación: traer factura y cédula desde la orden real (`orders` vía `order_items.order_id`), NO desde los campos manuales de `warehouse_movements`.**

Razones:
- `warehouse_movements.client_invoice` / `client_cedula` se digitan a mano en cada salida y no se exigen en el ingreso → quedan en blanco o con typos para la mayoría de items que hoy están adentro.
- Cada `order_item` ya está atado a una `order` con `invoice_number`, `customer_name`, `customer_doc_number` validados desde Ventas. Es la fuente única de verdad y se actualiza si Ventas corrige la factura.
- La vista operativa ya cruza `warehouse_item_locations → order_items → orders` (lo hace `listZoneContents`), así que no agrega joins nuevos.
- Los campos manuales quedan como respaldo histórico del movimiento, pero el dashboard ejecutivo muestra siempre el dato vivo de la orden.

Implementación: extender `listZoneContents` (ya devuelve `order.invoice_number`, `order.customer_name`) para incluir también `customer_doc_number` y `brand_id` / `supplier_id` del item. No se agregan columnas a tablas existentes.

---

### Decisión 2 — Ubicación de la pantalla

**Recomendación: pestaña nueva "Dashboard" dentro de `/erp/warehouse`, como primera pestaña por defecto. NO ruta separada.**

Razones:
- El patrón actual del proyecto agrupa todo lo de bodega en `/erp/warehouse` con `Tabs` (Resumen / Ingreso / Salida). Agregar una ruta hermana rompe ese patrón y obliga a duplicar el item del sidebar.
- Producción solo necesita ver — al entrar a `/erp/warehouse` con rol producción, las pestañas operativas (Ingreso / Salida) se ocultan y solo ve Dashboard + Resumen.
- Logística ve las 4 pestañas: **Dashboard** (nueva, por defecto), Resumen por zona, Ingreso, Salida.

---

### Cambios de base de datos

**Migración nueva: `warehouse_settings`** (tabla de configuración singleton)

```text
warehouse_settings
├── id (uuid PK)
├── stagnant_days_threshold (int, default 15)
├── singleton check: solo 1 fila permitida
└── updated_at / updated_by
```

- GRANT SELECT a `authenticated` (todos los roles autenticados leen el umbral).
- GRANT UPDATE solo vía RLS: política `has_role(auth.uid(), 'admin')`.
- Seed: insertar fila única con `stagnant_days_threshold = 15`.
- Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE warehouse_settings;` para que un cambio de umbral repinte sin recargar.

**Acceso de producción a tablas existentes (RLS):** revisar políticas de `warehouse_zones`, `warehouses`, `warehouse_movements`, `warehouse_item_locations`. Si producción hoy no tiene SELECT, agregar policy:
```text
USING (has_role(auth.uid(), 'produccion') OR has_role(auth.uid(), 'logistica') OR has_role(auth.uid(), 'admin'))
```
Producción nunca recibe INSERT/UPDATE/DELETE — eso ya está limitado a admin/operativo en las funciones server. La UI además oculta los formularios.

---

### Archivos nuevos

- `supabase/migrations/<timestamp>_warehouse_settings.sql` — tabla, GRANTs, RLS, seed, realtime.
- `src/lib/warehouse-settings.functions.ts` — `getWarehouseSettings()` (read, todos los roles) y `updateStagnantThreshold({ days })` (admin only, valida `has_role`).
- `src/features/warehouse/use-warehouse-settings-realtime.ts` — suscripción a cambios de `warehouse_settings` que invalida `["warehouse-settings"]`.
- `src/features/warehouse/executive-dashboard.tsx` — componente con:
  - Filtros: marca (usa `useBrand` ya existente), proveedor (select desde `suppliers`), rango de fechas sobre `last_movement_at`.
  - Tarjetas por zona activa: código de zona, cantidad de productos, lista compacta de facturas+cédulas únicas, indicador de cuántos están "estancados".
  - Click en tarjeta → `Sheet` con lista detallada: producto, n° factura, cédula, días en bodega, badge rojo (>X días) o naranja (≥X-3 días).
  - Banner editable solo para admin con el umbral X actual + botón "editar".

### Archivos modificados

- `src/lib/warehouse.functions.ts`:
  - extender `listZoneContents` para incluir `customer_doc_number`, `brand_id`, `supplier_id`, `supplier_name`.
  - nueva `listExecutiveDashboard({ brandId?, supplierId?, fromDate?, toDate? })` que devuelve por zona los items con sus datos de orden y `days_in_warehouse = now - last_movement_at` (calculado en SQL). Reutiliza la vista `warehouse_item_locations` ya usada por `listZoneContents`.
- `src/routes/_authenticated.erp.warehouse.tsx`:
  - agregar pestaña `Dashboard` como primera y `defaultValue="dashboard"`.
  - leer roles del usuario (patrón existente con `has_role` / `useQuery` de roles) y ocultar las pestañas `Ingreso` y `Salida` cuando el rol es `produccion`.
  - montar `useWarehouseSettingsRealtime()` además del realtime existente.

### Lógica reutilizada (no se duplica)

- "Qué hay en cada zona ahora" → ya está en la vista `warehouse_item_locations` + `listZoneContents`. El dashboard reusa exactamente ese join.
- "Días en bodega" → derivado de `warehouse_item_locations.last_movement_at` (ya existe). Se calcula `EXTRACT(DAY FROM now() - last_movement_at)` en la nueva función.
- Realtime de movimientos → ya cubierto por `useWarehouseRealtime` existente; el dashboard lo monta y queda al día sin recargar.

### Permisos resumidos

| Rol         | Ver Dashboard | Editar umbral | Ingreso/Salida |
|-------------|---------------|---------------|----------------|
| admin       | sí            | sí            | sí             |
| logistica   | sí            | no            | sí             |
| operativo   | sí            | no            | sí             |
| produccion  | sí (read-only)| no            | **oculto**     |

RLS hace cumplir lo de datos; la UI esconde lo demás.

---

¿Apruebo y procedo con la migración + código?
