# Productos relacionados (padre + hijos) en órdenes de producción

Permitir que un ítem de una orden se marque como "padre" y agrupe otros ítems como "hijos". El margen se calcula con la venta del padre contra la suma de costos de todo el grupo (padre + hijos, incluyendo fases multi-proveedor). Padre e hijos se renderizan como una sola card tanto en la edición de la orden como en el seguimiento, pero cada ítem conserva su propio estado, fases y flujo.

## Modelo de datos

Migración sobre `order_items`:
- Nueva columna `parent_item_id UUID NULL` con FK a `order_items(id) ON DELETE SET NULL`.
- Índice sobre `parent_item_id`.
- Constraint: `parent_item_id <> id` y `parent_item_id` debe pertenecer a la misma `order_id` (trigger de validación, no CHECK).
- Constraint: un ítem que es padre (tiene hijos) no puede a su vez tener `parent_item_id` (solo un nivel de anidamiento).

No se toca `order_item_phases` — cada hijo puede seguir teniendo sus propias fases con el toggle multi-proveedor existente.

## UI — Edición de la orden (`item-margins-section.tsx`)

- La lista se agrupa: primero se pintan los ítems raíz (`parent_item_id = null`); los hijos se anidan dentro de la card del padre.
- Nuevo control en cada ítem raíz: botón "Vincular productos" que abre un selector con los otros ítems de la misma orden aún sin padre. Al vincular, el hijo se mueve dentro de la card del padre.
- Botón "Desvincular" en cada hijo, dentro de la card del padre.
- Cálculo del margen del grupo:
  - Venta del grupo = `line_total` del padre.
  - Costo del grupo = suma de (costo efectivo del padre) + (costo efectivo de cada hijo). Costo efectivo por ítem: si `has_phases`, suma de `negotiated_cost ?? manufacturing_cost` de sus fases; si no, `negotiated_cost ?? manufacturing_cost` del ítem.
  - `pct = (venta - costo) / venta * 100`.
- El KPI global de la sección deja de sumar `line_total` de los hijos como venta (para no duplicar) — solo cuenta ventas de ítems raíz, y costos de todos.
- Dentro de la card del padre, cada hijo mantiene sus propios controles (proveedor, costo, negociación, toggle multi-proveedor con fases). El margen individual del hijo no se muestra (venta = 0 no tiene sentido); solo se muestra su costo aportado al grupo.
- El pill de margen aparece solo a nivel del grupo (en la card del padre).

## UI — Seguimiento (`_authenticated.erp.production.tracking.tsx` + `item-phases-tracking.tsx`)

- Misma agrupación visual: una card por ítem raíz. Los hijos se listan dentro con sus propios controles de inicio/fin y, si tienen fases, con su `ItemPhasesTracking`.
- Cada ítem (padre e hijos) mantiene su propio flujo `production_started_at` / `production_finished_at` y trigger de auto-finalización por fases — sin cambios.
- Un badge en la cabecera de la card muestra el progreso agregado (ej. "2/3 productos terminados") solo como información visual; no bloquea nada.

## Cambios de código

- `supabase/migrations/*` — añadir `parent_item_id`, índice, trigger de validación de misma orden y no auto-referencia/nietos.
- `src/features/production/item-margins-section.tsx` — agrupar por padre, nuevo selector de vinculación, ajustar `totals` y cálculo por grupo, ocultar pill/negociación en hijos, mostrar solo costo aportado.
- Nuevo `src/features/production/link-child-item-dialog.tsx` — diálogo para elegir hijos entre los ítems disponibles de la orden.
- `src/features/production/item-phases-tracking.tsx` y ruta de seguimiento — renderizar padre con hijos anidados; cada uno conserva su UI actual.
- `src/integrations/supabase/types.ts` se regenera tras aprobar la migración.

## Retro-compatibilidad

Ítems existentes tienen `parent_item_id = null` → se comportan igual que hoy. La agrupación es opt-in por orden.
