## Objetivo

Cuando una venta tiene varios productos, poder elegir exactamente cuáles enviar a producción (sin obligar a mandar todos), y dejar registrado qué producto pertenece a qué orden PROD para evitar duplicados y dar trazabilidad.

## UX del diálogo "Enviar a producción"

Al pulsar el botón se abre un diálogo con tres bloques:

1. **Destino** (igual que hoy)
   - Crear orden nueva, o
   - Actualizar una orden existente (PROD-…-00004 …)

2. **Productos a incluir** (nuevo)
   - Lista de los ítems de la venta con checkbox por cada uno.
   - Cada fila muestra: miniatura (si hay imagen), título/descripción, cantidad, y un badge de estado:
     - `Nuevo` (nunca enviado) — checkbox marcado por defecto.
     - `Ya en PROD-…-00004` — checkbox desmarcado, badge gris con link a esa orden.
   - Acciones rápidas arriba: **Seleccionar todos** · **Solo no enviados** · **Ninguno**.
   - Contador en vivo: "3 de 5 productos seleccionados".

3. **Confirmar**
   - Botón deshabilitado si no hay nada marcado.
   - Toast final: "Planimetría v2 generada con 2 productos en PROD-…-00004".

Si la venta tiene **un solo ítem**, se omite el bloque 2 y funciona como hoy (un clic).

## Tracking ítem → orden

Nueva columna `production_order_id uuid` en `order_items` (nullable, FK a `production_orders` con `ON DELETE SET NULL`).

- Al confirmar el envío, los ítems seleccionados se actualizan con el `production_order_id` destino.
- Si un ítem ya tenía una orden y se reasigna, se sobrescribe (caso raro pero soportado).
- En `production_orders` el detalle puede listar sus ítems con un simple `select … where production_order_id = …`.

## Generación de planimetría

`generatePlanimetryForOrder` recibe ahora `selectedItemIds: string[]` y filtra los `order_items` por ese conjunto antes de armar el PDF. El resto del flujo (versión, upload, insert en `production_planimetries`) no cambia.

## Cambios técnicos

**Migración**
```sql
ALTER TABLE public.order_items
  ADD COLUMN production_order_id uuid
  REFERENCES public.production_orders(id) ON DELETE SET NULL;
CREATE INDEX ON public.order_items(production_order_id);
```
RLS de `order_items` ya autoriza via la venta dueña, no requiere policy nueva.

**`src/features/production/send-to-production-button.tsx`**
- Query extra `order-items-for-production` que carga `id, description, quantity, images, sort_order, production_order_id` de la venta.
- Estado `selectedItemIds: Set<string>` con default = ítems sin `production_order_id` (o todos si es la primera vez).
- Render del nuevo bloque "Productos a incluir" con `Checkbox` + badges + acciones rápidas.
- `generatePlanimetryForOrder` recibe y filtra por `selectedItemIds`.
- Después del insert en `production_planimetries`, `UPDATE order_items SET production_order_id = <target> WHERE id IN (selectedItemIds)`.
- Invalidar también `order-items-for-production` y la query de detalle de la orden de producción.

**`src/routes/_authenticated.erp.production.$id.tsx`** (ajuste menor)
- Mostrar la lista de ítems vinculados (`order_items where production_order_id = this.id`) en lugar de todos los ítems de la venta, para que el detalle de la orden refleje solo lo que realmente se mandó.

## Resultado

- Venta con sofá + comedor + mesa → "Enviar a producción" → marco solo sofá → crea PROD-00004 con planimetría v1 (sofá). Sofá queda vinculado a PROD-00004.
- Días después marco comedor → "Enviar a producción" → diálogo muestra comedor como `Nuevo` y sofá como `Ya en PROD-00004` desmarcado → elijo "Crear orden nueva" → PROD-00005 v1 (comedor).
- Mesa queda pendiente, visible como `Nuevo` la próxima vez.
