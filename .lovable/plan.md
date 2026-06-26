## Notificar al vendedor cuando la factura pasa a "Pendiente por logística"

### Problema

Hoy la tarea `invoice_ready_for_collection` solo se crea dentro del trigger `on_order_item_finished` (cuando el último `order_item` queda terminado). Si un admin cambia el estado a "Pendiente por logística" manualmente desde la UI, no se dispara ningún trigger que genere la notificación, así que el vendedor no ve nada en **Mis tareas**.

La UI de `/erp/my-tasks` ya sabe pintar este tipo de tarea (icono `$` verde, CTA "Gestionar cobro") — el problema es 100% en backend: la tarea no se está creando en el caso manual.

### Plan

1. **Nueva función SQL** `public.notify_seller_invoice_ready(_order_id uuid, _note text)` (SECURITY DEFINER):
   - Lee `seller_id`, `brand_id`, `invoice_number`, `order_number` de la orden.
   - Si el vendedor existe y no hay ya una tarea `invoice_ready_for_collection` pendiente para esa orden → la inserta con el mismo título/razón unificado que usa hoy `on_order_item_finished` ("Factura lista — pendiente por logística y cobro del saldo …").
   - Idempotente: nunca duplica.

2. **Nuevo trigger** `trg_orders_notify_logistica` en `orders` (AFTER INSERT OR UPDATE OF status_id):
   - Si el `status_id` nuevo corresponde a `order_statuses.slug = 'pendiente-por-logistica'` → llama a `notify_seller_invoice_ready(NEW.id, ...)`.
   - Cubre tanto el cambio manual desde la UI/orden como cualquier otro flujo futuro (incluido `update_order_status`).

3. **Refactor de `on_order_item_finished`**: reemplazar el bloque `INSERT INTO seller_tasks(... invoice_ready_for_collection ...)` por una llamada a la nueva función, para que la lógica de creación de la tarea viva en un solo lugar y el mensaje siempre coincida.

4. **Sin cambios en el front**:
   - `src/routes/_authenticated.erp.my-tasks.tsx` ya renderiza `invoice_ready_for_collection` con estilo verde y CTA correcto.
   - `seller-tasks-panel.tsx` no se toca (filtra solo `fix_planimetry`, que es lo que pidió el usuario en mensajes previos).

### Archivos

- Migración SQL (función + trigger + reemplazo del bloque dentro de `on_order_item_finished`).
- Sin cambios en TS/TSX.

### Qué NO cambia

- La tarea sigue siendo una sola por factura (no se duplica ni se separa en dos avisos).
- El flujo automático "todos los productos terminados → pendiente por logística + novedad en producción" se mantiene exactamente igual; solo se centraliza la creación de la tarea.
- No se modifican policies ni se crean tablas, por lo que no hay GRANTs nuevos.
