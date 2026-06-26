## Estado "terminado" por producto + handoff a bodega y cobro

### 1. Rol(es) que pueden marcar un producto como `terminado`

Habilito **`admin` + `operativo`** (mismo rol que ya gestiona seguimiento de producción y opera bodega). Justificación:

- El módulo `/erp/production/tracking` ya es operado por producción interna; quien sigue el avance es quien naturalmente cierra el ítem.
- `operativo` ya tiene permisos de escritura en `warehouse_movements` (mismo rol que recibe el producto físico). Mantenerlo consistente evita un nuevo rol intermedio.
- `ventas`/`vendedor` se quedan fuera: no deben poder marcar producción como terminada (separación de funciones).
- `admin` se incluye por la política transversal del proyecto.

La validación vive en una función `can_finish_order_item(uid, item_id)` SECURITY DEFINER que combina `has_role('admin') OR (has_role('operativo') AND has_brand_access(brand_id))`, y se usa tanto en la policy de UPDATE de la columna nueva como en la server function.

### 2. ¿Trigger SQL o lógica en server function para "factura completa"?

Elijo **trigger SQL** sobre `order_items` (AFTER UPDATE de `production_finished_at`). Razones:

- El usuario pidió explícitamente "no duplicar la lógica de está toda la factura terminada en varios lugares… debe vivir en un único punto consultable". Un trigger garantiza que se ejecute aunque mañana se marque desde otro origen (script admin, migración correctiva, futura acción masiva).
- Sigue el patrón ya establecido en el proyecto: `sync_planimetry_seller_task`, `resolve_tasks_on_planimetry`, `create_task_on_production_reject` — todas son triggers que generan `seller_tasks`.
- La función `start_real_production` (server-side) ya demuestra el patrón de "insertar `seller_tasks` desde el backend"; reutilizo el mismo tipo de tarea con un nuevo `type = 'invoice_ready_for_collection'`.
- Idempotencia: el trigger sólo inserta la tarea si no existe ya una pendiente para esa `order_id` con ese tipo (mismo patrón anti-duplicado de `sync_planimetry_seller_task`).

Además, expongo una **función pública** `public.order_completion_progress(_order_id uuid)` que devuelve `{ total, finished, all_finished }`. La consume el UI (badge "2/3 terminados") y el trigger, así nadie reescribe la cuenta.

### 3. Representación visual en el selector de "Ingreso a bodega"

El selector deja de listar ítems planos y pasa a **agrupar por factura**:

```text
Factura #FV-0123 · Juan Pérez                       [2/3 listos]
  ☐ Sofá Loft 3 puestos                   Cant. 1   ✔ terminado 12 oct
  ☐ Mesa centro nogal                     Cant. 1   ✔ terminado 14 oct
  ─ Poltrona orejera                      Cant. 1   ⏳ en producción  (deshabilitado, gris)

Factura #FV-0119 · Constructora Sur                  [1/1 listo]
  ☐ Cabecero king                         Cant. 1   ✔ terminado 10 oct
```

- Cada factura es una sección colapsable con badge de avance (`finished/total`).
- Ítems no terminados se renderizan deshabilitados con la razón ("aún en producción"), nunca ocultos — así el operador entiende por qué no puede ingresarlos.
- Multi-selección con un botón "Ingresar seleccionados a Zona X" para procesar varios ítems terminados de la misma factura en una sola acción (las salidas siguen igual).

### 4. Archivos / tablas / componentes

**Migración SQL** (un único archivo):
- `order_items`: añadir `production_finished_at timestamptz`, `production_finished_by uuid`, `production_finished_by_email text`. Nullable (los items previos quedan como "no terminado").
- RLS update policy nueva sobre esas columnas usando `can_finish_order_item`.
- Función `public.order_completion_progress(_order_id)`.
- Función `public.has_role(...)` no se toca; agrego `can_finish_order_item`.
- Trigger `AFTER UPDATE OF production_finished_at ON order_items`:
  1. inserta auditoría en `order_audit_log` (acción `item_finished`, mismo patrón que `log_order_item_changes`).
  2. si `order_completion_progress(order_id).all_finished`, inserta `seller_tasks(type='invoice_ready_for_collection', ...)` evitando duplicados.
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;` (si no está ya, para que tracking y bodega vean el cambio sin recargar).
- GRANTs explícitos en cada función nueva (revoke from public + grant execute to authenticated).

**Server functions** (`src/lib/order-items-finish.functions.ts` nuevo):
- `markOrderItemFinished({ itemId })` con `requireSupabaseAuth` — verifica `can_finish_order_item` vía RPC, hace `UPDATE … SET production_finished_at = now(), production_finished_by = userId`. El trigger se encarga del resto.
- `unmarkOrderItemFinished({ itemId, reason })` para revertir (admin only) — útil si se marca por error.
- `getOrderCompletionProgress({ orderId })` que llama al RPC homónimo.

**Warehouse** (`src/lib/warehouse.functions.ts`):
- Reescribir `listItemsAvailableForIntake`: ahora filtra por `production_finished_at IS NOT NULL` (no por `production_orders.status='listo'`, que era a nivel orden). Devuelve los ítems agrupables por `order_id` con metadatos de factura y de "hermanos no terminados" para el badge de avance.
- Mantener exclusión de items ya en bodega.

**UI**:
- `src/features/warehouse/intake-by-invoice.tsx` (nuevo) — render agrupado descrito arriba; reemplaza el actual `IntakeForm` en `_authenticated.erp.warehouse.tsx`.
- `src/features/production/finish-item-button.tsx` (nuevo) — botón "Marcar terminado" en cada fila de ítem dentro de `_authenticated.erp.production.tracking.tsx`, visible sólo si `canOperate` y si el ítem no está terminado. Confirma con dialog.
- `src/features/production/invoice-progress-pill.tsx` (nuevo) — badge "2/3 terminados" que se muestra en tracking y en el header del selector de bodega.
- En `src/routes/_authenticated.erp.orders.$id.tsx` (detalle de venta del vendedor): mostrar el mismo pill por factura para visibilidad del vendedor.

**Realtime**:
- Bodega ya usa `use-warehouse-realtime`: agregar suscripción a `order_items` (evento UPDATE de `production_finished_at`) para refrescar `listItemsAvailableForIntake`.
- Tracking ya tiene canal `production-tracking-${brand}`: agregar listener `postgres_changes` para `order_items` y refrescar el query del drive.

**Seller tasks panel**:
- `src/features/seller-tasks/seller-tasks-panel.tsx`: añadir render para `type='invoice_ready_for_collection'` (icono $, color verde) con CTA "Ir a cobros" → ruta de la venta.

### Notas

- No se toca `production_orders.status` ni `real_production_orders.stage`: ése es el ciclo de la **orden de producción** (lote), no del ítem. El nuevo campo coexiste sin colisión y sirve para granularidad por producto, como pide el usuario.
- Migración de datos: para ítems ya entregados o cuyo `production_orders.status='listo'/'entregado'`, podemos hacer un `UPDATE` retroactivo en la misma migración para fijarles `production_finished_at = production_orders.completed_at`. Lo incluyo para no romper la base instalada — confírmame si prefieres dejarla vacía.
