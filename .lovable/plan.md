## Problema

Hoy, en el diálogo "Enviar a producción", todos los productos de la venta son seleccionables — incluso los que ya fueron enviados a una orden de producción activa. Eso permite que un vendedor cree una segunda orden (p. ej. para ebanistería) e incluya por error la cama y el sofá que ya están en Montenegro Atelier, duplicando el trabajo y rompiendo el seguimiento.

## Comportamiento deseado

Por cada venta:

1. Un producto solo puede pertenecer a **una** orden de producción activa a la vez.
2. Si ya está enviado a una orden activa:
   - No puede incluirse al **crear una orden nueva** (queda deshabilitado).
   - Solo puede aparecer marcable cuando el destino es **esa misma orden** (regenerar planimetría con cambios).
3. Los productos que quedan sin enviar siguen disponibles para crear una **nueva orden** con otro proveedor (mesa de centro → ebanistería).
4. Excepción: si la orden a la que estaba ligado quedó en estado `rechazada` o fue eliminada, el producto se libera y vuelve a estar disponible para una orden nueva.

## Cambios

### Frontend — `src/features/production/send-to-production-button.tsx`

- Calcular, por cada `order_item`, si está "bloqueado" para el destino actual:
  - `lockedForNew` = tiene `production_order_id` y esa orden existe y no está `rechazada`.
  - Al destino "Crear orden nueva": los bloqueados se muestran deshabilitados, con badge del código de la orden actual y leyenda "Ya en {CÓDIGO}", y el checkbox no responde.
  - Al destino = una orden existente X: solo los items cuyo `production_order_id` es `X` (o `null`, para añadir productos sueltos) son seleccionables; los que pertenecen a **otra** orden activa quedan deshabilitados con la leyenda "Pertenece a {OTRO CÓDIGO}".
- `selectUnsent` ya hace lo correcto; ajustar `selectAll` para que solo seleccione los habilitados según el destino.
- Al cambiar `selectedTarget`, recomputar `selectedItems` quitando los que quedaron deshabilitados.
- Si al abrir el diálogo **todos** los items ya están en órdenes activas y el usuario elige "Crear orden nueva", deshabilitar el botón Confirmar con tooltip "Todos los productos ya están en una orden de producción activa".

### Backend — migración (defensa en profundidad)

Trigger `BEFORE UPDATE` en `public.order_items` que rechace cambiar `production_order_id` de un valor no nulo a otro valor no nulo cuando la orden actual no está `rechazada`. Mensaje: "Este producto ya pertenece a una orden de producción activa. Libérelo primero rechazando o eliminando la orden anterior." Esto blinda la regla aunque alguien llame al RPC directo desde otro cliente.

## Lo que NO cambia

- Estructura de `production_orders`, `seller_tasks`, `production_planimetries`.
- Flujo de rechazo y de tareas del vendedor (sigue funcionando: al rechazar, los items se "liberan" porque la orden queda `rechazada`).
- La vista de seguimiento de producción.

¿Avanzo con este enfoque?
