## Objetivo

Llevar el módulo **Producción** del ERP al nivel del Drive de seguimiento: replicar las columnas que usa el equipo, separar la vista por marca (como las pestañas MD/EM/GT/CD), y cerrar el ciclo de rechazo de planimetría con tareas para el vendedor.

## 1. Campos del Drive → modelo de datos

Amplío `production_orders` con los hitos del Drive (todos opcionales — el flujo los va llenando):

| Columna Drive | Campo nuevo en `production_orders` |
|---|---|
| FAC | `invoice_number` (ya está en `orders`, lo muestro aquí) |
| PROVEEDOR | `supplier_id` (FK opcional → `suppliers`) |
| FECHA FACTURA | `invoice_date` |
| PLANIMETRÍA | `planimetry_sent_date` (fecha que se envió al proveedor) |
| COTIZACIÓN | `quotation_date` |
| PRODUCCIÓN | `production_start_date` |
| ENTREGA PROVEEDOR | `supplier_promised_date` (lo que prometió el proveedor) |
| ENTREGA REAL PROVEEDOR | `supplier_actual_date` (fecha real de entrega a bodega) |
| FECHA PROMESA CLIENTE | `client_promised_date` |
| ENTREGA REAL A CLIENTE | `client_actual_date` |
| NOVEDAD | `novedad` (enum: `cotizando`, `produccion`, `entrega_inmediata`, `entregada`, `anulada`, `pendiente`) — reemplaza el `status` actual como etapa visible |
| PRODUCCIÓN (JV) | `production_owner_id` (FK opcional → `profiles`, responsable interno) |
| VENDEDOR | derivado de `orders.seller_id` |
| PRECIO VENTA | derivado de `orders.total` |
| COSTO FABRICACIÓN | `manufacturing_cost` |
| MARGEN | calculado (trigger) = `(total − manufacturing_cost) / total` |
| OBSERVACIÓN | `notes` (ya existe) |

El `status` actual (`pendiente / en_proceso / listo / rechazada`) se mantiene como **estado del flujo interno** (aceptar planimetría, rechazar, etc.); `novedad` es la **etiqueta que ve el equipo** y que se exporta visualmente como en el Drive.

## 2. Vista por marca (pestañas tipo Drive)

En `/erp/production` agrego una barra de pestañas con las marcas a las que el usuario tiene acceso (MD, EM, GT, CD…). Cada pestaña filtra la tabla por `brand_id`. El filtro por año queda como dropdown secundario (por defecto el año actual). No duplicamos tablas: una sola lista filtrada, igual que las hojas del Drive.

La tabla muestra las mismas columnas del Drive, en el mismo orden, con celdas editables inline para las fechas y la novedad (los vendedores y producción la llenan ahí mismo).

## 3. Rechazo de planimetría → tareas del vendedor

Cuando producción rechaza una planimetría (`reject_production_with_reason` ya existe):

- Se crea una fila en una tabla nueva `seller_tasks`:
  - `seller_id`, `order_id`, `production_order_id`, `brand_id`
  - `type = 'fix_planimetry'`
  - `title`, `reason` (el motivo del rechazo)
  - `status` (`pendiente` / `resuelta`), `created_at`, `resolved_at`
- Se marca automáticamente como **resuelta** cuando el vendedor sube una nueva versión de planimetría a esa orden (no hay límite de intentos; cada rechazo crea una tarea nueva).

**UI nueva:**

- **`/erp/my-tasks`** — vista "Mis tareas" con pendientes/resueltas, filtros por marca, link directo a la venta y a la orden de producción.
- **Badge en el detalle de la venta** (`/erp/orders/$id`) cuando hay tareas `fix_planimetry` pendientes, con el motivo y un CTA "Subir planimetría corregida".
- **Contador en el sidebar** junto a "Mis tareas" con las pendientes del vendedor.

## 4. Acceso multi-rol (de la conversación previa)

Tu usuario queda con rol `admin` para ver todos los módulos. El switch de rol queda fuera de este hito — luego asignamos visibilidad por rol.

## Detalles técnicos

- **Migración 1** — `ALTER TABLE production_orders` con los campos nuevos; agregar enum `production_novedad`; trigger para `margin_pct`; índice por `(brand_id, novedad)`.
- **Migración 2** — `CREATE TABLE seller_tasks` con GRANTs + RLS (vendedor ve las suyas, admin todas, ventas con `has_brand_access`); trigger en `production_planimetries` que marca como resueltas las tareas `fix_planimetry` pendientes de esa `production_order_id` al insertar una versión nueva; trigger en `production_orders` que crea una tarea cuando `status` pasa a `rechazada`.
- **Frontend** — refactor de `_authenticated.erp.production.index.tsx` con tabs de marca + tabla extendida; nueva ruta `_authenticated.erp.my-tasks.tsx`; badge reutilizable en el detalle de venta y producción; item de sidebar.
- **Server functions** — `getMyTasks`, `resolveTask` (manual), `updateProductionTrackingFields` (para edición inline de fechas/novedad/costo).
- Respeto la regla de memoria: `staleTime 5min`, `refetchOnMount: false`, sin tocar `AuthSync`.

## Lo que NO entra en este hito

- Sincronización real con Google Drive (lectura/escritura de la hoja).
- Notificaciones push/email.
- Permisos por rol granulares (queda para después, según lo conversado).
- Lógica de `real_production_orders` (ya existe en paralelo y se mantiene).

¿Avanzo?