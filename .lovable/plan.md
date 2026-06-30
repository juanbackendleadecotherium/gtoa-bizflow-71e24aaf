# Mejoras: Producción + Logística

## 1) Notificación de pago restante al proveedor (al marcar terminado)

Cuando un `order_item` se marca como terminado:

- Crear una `seller_task` (reutilizamos esa tabla cambiando el `role` destino) tipo `confirm_supplier_final_payment` dirigida al usuario encargado de pagos. Como hoy no hay un rol "pagos", la asignamos a usuarios con rol `admin` + a quien hizo el primer pago del 50% en `order_item_supplier_payments` (auditor del pago). Si quieres, agregamos un rol `finanzas` (te lo confirmo abajo en preguntas).
- La tarea incluye: ítem, proveedor, monto total acordado, monto ya pagado (advance), **monto restante** (calculado), y dos botones:
  - **Sí, ya pagué** → registra un nuevo renglón en `order_item_supplier_payments` con `payment_type='final'` y marca la tarea como `done`.
  - **No, aún no** → mantiene la tarea pendiente (no la oculta).
- Se muestra en `/erp/my-tasks` con su propia tarjeta (sección "Pagos finales a proveedor") con el monto restante en grande.

SQL:
- Trigger `notify_final_supplier_payment_on_finish` sobre `order_items` cuando `finished_at` pasa de null → fecha.
- Migración añade columna `payment_type` (`advance` | `final`) a `order_item_supplier_payments` (default `advance` para data actual).
- RPC `confirm_final_supplier_payment(_item_id, _amount, _account, _ref)`.

## 2) Aviso al vendedor cuando su producto queda terminado

- Mismo trigger crea una `seller_task` tipo `item_finished_notify` para `orders.seller_user_id` con texto: "Tu producto X de la factura Y ya fue terminado por producción. Puedes informar al cliente."
- Aparece como notificación tipo "info" (no bloquea nada), se marca como leída con un solo botón "Entendido".

## 3) Asignación múltiple de productos a un conductor (logística)

En `pickup-table.tsx` (tab Activas):
- Añadir checkbox de selección por fila + checkbox "seleccionar todas".
- Barra de acciones flotante cuando hay ≥1 seleccionado: botón **Asignar conductor** y selector **Destino** (Bodega / Cliente) aplicado en lote.
- Nuevo server fn `bulkAssignDriver({ pickupIds, driverId, destination, destinationWarehouseId? })` que itera (reusa lógica de `assignDriver` y `updatePickupBasics`).
- Solo permite seleccionar pickups en estado `pendiente` o `asignada` (las demás se deshabilitan).

## 4) Disponibilidad logística: rango y arrastre

En `availability-calendar.tsx`:
- Reemplazar `Calendar mode="single"` por `mode="multiple"` + soporte de **rango por shift+click** y **arrastre del mouse** (mousedown sobre día → mousemove marca el set temporal → mouseup abre diálogo de confirmación).
- Diálogo de confirmación muestra "N días seleccionados", botones **Marcar disponibles** / **Marcar no disponibles** + nota opcional aplicada a todos.
- Server fn nueva `setAvailabilityBulk({ dates: string[], available: boolean, note? })` que hace upsert en `logistics_availability`.
- Se respetan los días ya marcados (sobrescribe).

## Archivos a tocar

- `supabase/migrations/*` — trigger, columna `payment_type`, RPCs.
- `src/lib/supplier-advance-payments.functions.ts` — `confirmFinalSupplierPayment`.
- `src/lib/pickup-orders.functions.ts` — `bulkAssignDriver`.
- `src/lib/logistics-scheduling.functions.ts` — `setAvailabilityBulk`.
- `src/features/logistics/pickup-table.tsx` — selección múltiple + barra de acciones.
- `src/features/logistics/availability-calendar.tsx` — drag/range.
- `src/features/seller-tasks/seller-tasks-panel.tsx` — render de las dos nuevas tareas.
- `src/routes/_authenticated.erp.my-tasks.tsx` — sección "Pagos finales".

## Preguntas rápidas antes de implementar

1. **¿A quién va la notificación de pago final?** Opciones: (a) a todos los `admin`, (b) creamos rol nuevo `finanzas` y se la mostramos solo a ellos, (c) al usuario que registró el pago del 50% inicial. Mi default si no respondes: **(a) admins + (c) quien registró el anticipo**.
2. **Aviso al vendedor:** ¿basta una tarea informativa en su bandeja, o también quieres email/WhatsApp? Default: **solo bandeja**.
