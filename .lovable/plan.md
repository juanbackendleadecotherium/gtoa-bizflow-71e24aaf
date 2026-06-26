## Auto "Pendiente por logística" en producción cuando se completa la factura

### Qué cambia

Hoy, cuando todos los `order_items` de una venta quedan terminados, el trigger `on_order_item_finished` ya:
- Cambia `orders.status_id` → estado "Pendiente por logística".
- Crea tarea `invoice_ready_for_collection` para el vendedor.

Pero la **novedad** de la(s) `production_orders` asociada(s) no se mueve, así que en `/erp/production/tracking` la columna "Novedad" sigue mostrando "Producción". Eso es lo que falta.

### Plan

1. **Catálogo de novedades** (`src/features/production/novedad-meta.tsx`)
   - Agregar `{ value: "pendiente_por_logistica", label: "Pendiente por logística", color: violeta }` entre "Producción" y "Entrega inmediata".
   - Sin cambios en `NovedadBadge` ni el `Select` de tracking: ambos leen de `NOVEDADES`, así que el nuevo valor aparece automáticamente como chip filtrable y como opción del selector.

2. **Migración SQL** — extender `on_order_item_finished` (el trigger único que ya centraliza el cierre de factura):
   - Después de fijar `orders.status_id` a "Pendiente por logística", recorrer todas las `production_orders` de ese `order_id` (vía `order_items.production_order_id DISTINCT`) y poner `novedad = 'pendiente_por_logistica'` cuando la novedad actual sea `'pendiente'`, `'cotizando'` o `'produccion'` (no pisar `entregada`, `anulada`, ni un `entrega_inmediata` ya marcado manualmente).
   - El cambio queda auditado vía `log_production_changes` (ya existe; pero ese trigger sólo audita status/workshop/priority/etc., no `novedad`). Para no perder trazabilidad, agrego en `on_order_item_finished` un `INSERT` directo en `production_audit_log` con `action='novedad_auto'`, `field='novedad'`, nota "Factura completa → pendiente por logística".
   - Notificación adicional al vendedor: la actual tarea `invoice_ready_for_collection` cubre "lista para cobro". El usuario pide además aviso explícito de "pendiente por logística". Lo resuelvo **ajustando el título/razón de esa misma tarea** para que mencione ambas cosas (mismo registro, mismo punto único — sin duplicar tareas). Texto propuesto: "Factura lista — pendiente por logística y gestiona el cobro del saldo".

3. **Realtime / UI**
   - `production_orders` ya está en el canal `production-tracking-${brand}` de la página, así que el cambio de `novedad` se refleja sin recargar — no se toca el front más allá del paso 1.

### Archivos

- `src/features/production/novedad-meta.tsx` (agregar entrada).
- Migración SQL: reemplazar función `on_order_item_finished` con la versión extendida (mismo trigger).

### Reglas respetadas

- Lógica de "factura completa" sigue viviendo en un único punto (`on_order_item_finished` + `order_completion_progress`).
- Roles vía `has_role()` (no se tocan policies).
- Sin nuevas tablas → no se requieren GRANTs.
- Realtime ya activo para `production_orders`.

### Lo que NO cambia

- `orders.status_id` ya se mueve hoy → confirmado, lo dejo igual.
- Estado `production_orders.status` (workflow interno de la PO) no se toca.
- No agrego una segunda tarea al vendedor — reuso la existente para no duplicar.
