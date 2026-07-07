
## 1. Renombrar rol y ajustar permisos (`src/lib/permissions.ts`)

- `ROLE_LABELS.operativo`: `"Operativo de Bodega"` → **`"Producción"`**.
  (Mantenemos el slug interno `operativo` en BD para no migrar `user_roles`; solo cambia la etiqueta visible en UI y selectores de usuarios.)
- Nuevos permisos para `operativo`:

  | Módulo | Antes | Ahora |
  |---|---|---|
  | dashboard | brand | brand |
  | production | brand | brand |
  | my_tasks | all | all |
  | supplier_payments | — | **all** |
  | suppliers | — | **all** |
  | orders (Ventas) | brand | **quitado** |
  | warehouse (Bodega) | brand | **quitado** |
  | logistics | — | — (sigue oculto) |

Resultado en el sidebar de Alejandra: Dashboard · Producción · Mis tareas · Pagos a proveedores · Proveedores.

## 2. Dashboard propio para Producción (`src/routes/_authenticated.erp.index.tsx`)

Cuando el usuario tenga rol `operativo` (y no sea admin ni ventas), renderizar una variante distinta del dashboard con foco operativo, no comercial:

- **Encabezado**: "Panel de Producción — {marca activa}" con el owner de la marca (Alejandra/Jonathan desde `brand-owners.ts`).
- **KPIs superiores** (cards) leídos de `production_orders` filtrados por `brand_id`:
  - OPs pendientes de revisar planimetría (`status = 'pendiente'`).
  - OPs en proceso (`status = 'en_proceso'`).
  - OPs en control de calidad (`status = 'control_calidad'`).
  - OPs listas para entrega (`status = 'listo'`).
  - Anticipos a proveedor pendientes de pago (cuenta desde `supplier-advance-payments`).
- **Lista "Requieren tu atención"**: OPs `pendiente` de esta marca con link directo a `/erp/production/{id}`, ordenadas por fecha creación asc.
- **Bloque "Novedades activas"**: OPs con `novedad` distinta de null.
- Sin bloques de ventas, comisiones ni metas.

El dashboard actual (ventas/finanzas/admin) queda intacto; se elige por rol al inicio del componente.

## 3. Notificación al aceptar/revisar nueva OP

Hoy, cuando Claudia (vendedora) envía una venta a producción, se crea una fila en `production_orders` con `status = 'pendiente'`, pero **no** se genera ninguna `seller_task` para el equipo de producción. Por eso Alejandra no vio la alerta.

### Migración SQL

1. Nueva tabla `brand_production_owners(brand_id uuid, user_id uuid, PRIMARY KEY (brand_id, user_id))` con GRANTs y RLS (lectura para authenticated, escritura solo admin vía `has_role`). Seed inicial mapeando los brands actuales a los `user_id` reales de Alejandra y Jonathan (a partir de `profiles.email`).
2. Nuevo trigger `trg_notify_production_new_op` en `AFTER INSERT ON public.production_orders`:
   - Lee `brand_id` y `order_id` de la OP.
   - Para cada `user_id` en `brand_production_owners` de esa marca, inserta una `seller_tasks` con:
     - `seller_id = user_id`
     - `type = 'production_review_op'`
     - `title = 'Nueva orden de producción para revisar'`
     - `reason = 'Claudia (o vendedor real) cargó la OP de la venta #NNN. Revisa la planimetría y acéptala o recházala.'`
     - `severity = 'warning'`, `status = 'pendiente'`, `production_order_id`, `order_id`, `brand_id`.
3. Trigger complementario en `AFTER UPDATE OF status` de `production_orders`: cuando la OP pasa de `pendiente` a cualquier otro estado (`en_proceso` = aceptada, `rechazada`), marca la task correspondiente como `resuelta` para que desaparezca de "Mis tareas".

### UI (`src/routes/_authenticated.erp.my-tasks.tsx`)

Agregar render para el nuevo `type: 'production_review_op'`: card en tono ámbar con título, número de venta, marca y botón **"Revisar OP"** que lleva a `/erp/production/{production_order_id}`. Al aceptar/rechazar la OP desde ese detalle, el trigger del paso 3 la archiva automáticamente.

## 4. Verificación

Con Alejandra logueada:
- El sidebar muestra solo los 5 módulos indicados.
- El dashboard es la nueva versión de producción.
- Al pedirle a Claudia que envíe una nueva venta a producción, aparece la tarea en "Mis tareas" de Alejandra y se archiva sola cuando ella acepta o rechaza la OP.

## Detalles técnicos

- No se crea rol nuevo en BD; solo cambia el label y la matriz de permisos.
- `brand_production_owners` reemplaza gradualmente el mapa hardcoded de `brand-owners.ts` (ese archivo se mantiene como fallback visual por ahora).
- El trigger se ejecuta con `SECURITY DEFINER` y `search_path = public` para poder insertar en `seller_tasks` bajo RLS.
