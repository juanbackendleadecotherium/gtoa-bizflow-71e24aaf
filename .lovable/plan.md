
# Producción: planimetría por producto y seguimiento granular

## Objetivos

1. **Una planimetría por producto** (PDF independiente por ítem).
2. **Fechas de proveedor por producto** dentro del seguimiento.
3. **Botón "Inicio de producción real" por producto** que sella la fecha y notifica al vendedor en *Mis tareas*.
4. **Due-date para producción = entrega al cliente − 3 días hábiles** (excluye domingos y festivos CO; sábados cuentan), impreso en la planimetría.
5. **Automatizaciones**:
   - Al asignar proveedor por primera vez (a la OP o a un ítem), auto-rellenar la fecha de cotización con hoy.
6. **Sembrar proveedores principales**: *Montenegro Atelier Tapicería* y *Ebanistería*.

## Cambios de base de datos (migración)

### `order_items` — campos nuevos por producto
- `supplier_promised_date date`
- `supplier_actual_date date`
- `production_started_at timestamptz`
- `production_due_date date` *(snapshot = entrega cliente − 3 hábiles al momento de generar planimetría; se usa también para mostrar en el seguimiento)*

### `production_planimetries` — planimetría individual
- `order_item_id uuid references order_items(id) on delete cascade` *(nullable para no romper históricos; nuevas filas siempre lo traen)*
- Índice `(production_order_id, order_item_id, version)`.

### `seller_tasks` — nuevo tipo informativo
- Permitir `type = 'production_started'` (no requiere acción, solo alertamiento).
- Campos extra opcionales: `order_item_id uuid`, `severity text default 'info'` (para distinguir tarea vs alerta).

### Triggers / funciones
- `order_items_auto_quotation_date()`: si `supplier_id` cambia de NULL→algo y la OP no tiene `quotation_date`, setear `production_orders.quotation_date = current_date`. (Igual cuando se asigna proveedor a nivel OP.)
- `production_orders_auto_quotation_date()`: misma idea sobre `production_orders.supplier_id`.
- RPC `start_real_production(p_item_id uuid)`:
  - Set `order_items.production_started_at = now()`.
  - Insert `seller_tasks` tipo `production_started`, severity `info`, vinculado al ítem y al vendedor de la orden, título "Tu producto ya empezó a producirse" + descripción con el nombre del producto + fecha.
  - Si todas las líneas de la OP tienen `production_started_at`, también setear `production_orders.production_start_date = current_date` (si está vacío).
- GRANTs estándar para columnas nuevas + RLS heredada (no cambia).

### Seed de proveedores
- Insertar *Montenegro Atelier Tapicería* y *Ebanistería* en cada `brands` activa donde aún no existan (idempotente por `(brand_id, lower(name))`).

## Cambios de frontend

### Util `lib/business-days.ts`
- `subtractBusinessDays(date, n)` que retrocede `n` días saltando domingos y festivos CO.
- Festivos CO hardcodeados para 2025-2027 (lista cerrada de fechas fijas + Ley Emiliani trasladados al lunes). Comentario para extender cada año.

### Planimetría — un PDF por producto
`src/features/production/send-to-production-button.tsx` → `generatePlanimetryForOrder`:
- Para cada `selectedItemId`: construir `PlanimetryDocumentData` con **un solo item**, generar PDF independiente, subir a Storage, e insertar fila en `production_planimetries` con `order_item_id` poblado y `version` calculada por ítem.
- En la planimetría usar `production_due_date` (calculado con `subtractBusinessDays(estimated_delivery_date, 3)`) en lugar de la fecha cruda. Persistir ese valor también en `order_items.production_due_date` para que coincida con lo que ve el equipo.
- Mantener regeneración: si se vuelve a generar para los mismos ítems, sube a `version + 1` por ítem.

`planimetry-uploader` / lista de planimetrías:
- Mostrar agrupadas por producto (cuando exista `order_item_id`); fallback al comportamiento actual para históricos.

### Seguimiento (`_authenticated.erp.production.tracking.tsx`) — panel expandido
En la lista de "Productos en producción" del `ExpandedPanel`, debajo de cada producto:
- Dos `DateField`: **Prometida proveedor** (`supplier_promised_date`) y **Real proveedor** (`supplier_actual_date`).
- **Indicador de "Producción debe terminar"**: `production_due_date` en chip (read-only, recalculable si cambia la entrega).
- Botón **"Inicio producción real"**:
  - Visible cuando `production_started_at` es NULL.
  - Al clic: `rpc("start_real_production", { p_item_id })`. Toast "Marcado e informado al vendedor".
  - Cuando ya tiene valor, muestra `📍 Iniciado el dd/mm` (texto fijo).
- Patch de los DateField por ítem va contra `order_items`, no la OP.

### Aprobación de órdenes (visual)
No cambia el flujo, pero la previsualización/listado debe mostrar las planimetrías por ítem cuando el operador entre al detalle.

### Mis tareas (`_authenticated.erp.my-tasks.tsx`)
- Renderizar tareas `type = 'production_started'` con estilo "info" (azul, ícono `Rocket`), sin botón de acción, con CTA "Ver venta" → ruta de la orden. Las `fix_planimetry` mantienen su estilo actual.
- Badge sidebar sigue contando solo pendientes (las `info` se pueden auto-resolver en 14 días vía `pg_cron` opcional — fuera de alcance ahora).

## Recomendaciones / mejoras incluidas

1. **`production_due_date` como snapshot en el ítem**: si después cambia la fecha de entrega al cliente, el due-date original queda visible y se puede recalcular con un botón "Recalcular due-date" (lo dejo previsto pero no expongo UI en esta tanda salvo que lo pidas).
2. **Quotation_date** se autocompleta también cuando el proveedor se asigna a nivel de ítem (no solo OP), porque ahora la asignación real es por producto.
3. **Sábados como hábiles**: tal como pediste; festivos colombianos como no hábiles. Para feriados futuros, agregamos la lista 2025-2027 ahora y dejamos un comentario `// extender cada año` en el util.

## Cómo lo probamos

1. **Migración**: aprobar la migración (crea columnas, triggers, RPC y semilla de proveedores).
2. **Crear venta** con 3 productos en marcas existentes; enviar a producción.
3. **Verificar planimetrías**: ahora deben aparecer 3 archivos PDF separados (uno por ítem) en la sección Planimetrías de la OP; cada uno con la fecha de entrega impresa = entrega cliente − 3 hábiles.
4. **Aceptar la OP** y abrir Seguimiento → expandir la fila → comprobar que cada producto tiene sus dos fechas de proveedor + botón "Inicio producción real".
5. **Asignar proveedor distinto** a cada ítem → la *fecha de cotización* de la OP se autocompleta con la fecha de hoy.
6. **Pulsar "Inicio producción real"** en uno: aparece sello con la fecha y el vendedor recibe en *Mis tareas* una tarjeta info "Tu producto … empezó a producirse hoy".
7. **Cambiar fecha de entrega** en la venta a un viernes y verificar que la planimetría regenerada muestra el martes anterior (saltando domingo).

## Pendiente de confirmar antes de implementar

- **Proveedores semilla en qué marcas**: por defecto los crearé en todas las marcas activas. Si solo aplica a una marca específica (Getova, otra), dímelo y lo limito.
- **Alerta "producción iniciada"**: la generaré por producto (1 alerta por ítem). Si prefieres una sola alerta agregada por OP cuando arranca el primer ítem, lo ajusto.
