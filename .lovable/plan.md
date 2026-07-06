## 1. Hitos de la orden (Seguimiento de producción)

Panel derecho de cada OP en `/erp/production/tracking`.

- **Cuenta de cobro**: ya se guarda `invoice_date` al emitir la cuenta la primera vez. Añadir dos cosas:
  - Backfill automático: cuando se crea/actualiza una `production_order`, si su orden ya tiene una versión de invoice emitida, tomar la fecha de esa primera emisión y ponerla en `production_orders.invoice_date`.
  - Migración de datos para llenar `invoice_date` en las OPs actuales que ya tienen invoice emitida (incluida la de Montenegro).
  - Mostrar el campo como solo lectura (formateado dd/mm/aaaa), no editable — se llena solo desde ventas.

- **Planimetría**: se queda igual (ya toma la fecha en que se acepta / genera la planimetría).

- **Prometida** → renombrar a **"Entrega prometida al cliente"** y usar como fuente `orders.estimated_delivery_date` (la fecha real prometida en la venta, ej. 5 de agosto). Solo lectura en este panel. Se propaga automáticamente al crear/actualizar la OP; la de Montenegro se rellena por migración.

- **Real** → renombrar a **"Entrega real (último producto)"**. Se seguirá llenando cuando se registre la entrega final del último producto de la cuenta de cobro (misma lógica actual sobre `client_actual_date`, solo cambia la etiqueta y el copy de "Sin entrega" para que sea claro que aplica al último producto).

## 2. Badge "Pendiente de planimetría" que no cambia a "En producción"

Causa: hoy no existe ninguna transición automática de `orders.status_id` a `en-produccion`. El estado solo cambia manualmente o cuando se termina todo (pasa a `pendiente-por-logistica`). Por eso una venta con productos ya en OP sigue mostrando "Pendiente de planimetría" hasta que alguien la cambie a mano.

Arreglo: trigger `on_production_order_accepted` que, cuando **todos** los `order_items` de una orden queden vinculados a una `production_order` (o sean `is_standard_product = true`), actualice `orders.status_id` al estado `en-produccion` de esa marca, dejando historial en `order_status_history` con nota "Todos los productos enviados a producción". El productos estándar ya no rompe el conteo (excepción explícita en el trigger). Backfill para la orden de Montenegro y cualquier otra que hoy esté mal etiquetada.

## 3. Tarea "Coordinar entrega parcial"

- **Nuevo título**: "Coordinar entrega parcial · llenar Forms de logística y cobrar saldo si aplica".
- **Reason** actualizado con la instrucción explícita ("Llena el Forms de logística y registra el cobro del saldo antes de marcar como completada").
- **Botón "Visto" reemplazado por check "Marcar Forms enviado y saldo cobrado"**. La tarea NO se puede resolver hasta que el vendedor marque ese check. Quitar el flujo actual de "Visto" para este tipo.
- Al marcar el check:
  - `seller_tasks` pasa a `resuelta` con timestamp y actor.
  - Se registra un flag `forms_completed_at` en la tarea.
  - Se crea una tarea nueva en `seller_tasks` dirigida al owner de producción de la marca (usando `ownerForBrandSlug`), tipo `partial_shipment_forms_done`, con título "Forms de entrega parcial listo — verifica logística" y link al pedido. Aparecerá en Mis tareas del equipo de producción con severidad info.
- Si el vendedor no marca el check, la tarea sigue pendiente indefinidamente (no se auto-archiva).
- Enlace CTA al Forms externo (usar la URL guardada en la memoria de "Formulario externo"; si no existe, dejar un placeholder configurable en `brand_production_settings`).

## 4. Tarea "Cuenta de cobro lista — pendiente por logística y cobro del saldo"

Mismo patrón que #3:

- **Título**: "Cuenta de cobro lista · llenar Forms de logística y cobrar saldo".
- **Reason** con instrucción explícita del Forms + cobro del saldo.
- **Check obligatorio**: "Marcar Forms enviado y saldo cobrado". Reemplaza el "Visto" actual para el tipo `invoice_ready_for_collection`.
- Al marcar el check:
  - La tarea pasa a `resuelta`.
  - Se dispara `seller_tasks` de tipo `invoice_collection_forms_done` al owner de producción de la marca ("Cuenta de cobro MD-XXXX: Forms listo, procede con logística").
- Sin check, la tarea sigue pendiente y visible.
- CTA al Forms externo, misma URL que el punto 3.

## Detalles técnicos

- Migración con: nueva columna `seller_tasks.forms_completed_at timestamptz`, función `mark_task_forms_done(p_task_id uuid)` (SECURITY DEFINER) que valida propiedad, marca resuelta y crea la tarea de producción correspondiente.
- Trigger `set_production_order_hitos()` en `INSERT`/`UPDATE` de `production_orders` para copiar `invoice_date` (desde `invoice_versions` v1) y `client_promised_date` (desde `orders.estimated_delivery_date`).
- Trigger `sync_order_status_on_production()` sobre `order_items` (cuando `production_order_id` cambia a NOT NULL) que llama a `orders_all_items_in_production(order_id)` y si es true mueve `orders.status_id` a `en-produccion`.
- UI:
  - `src/routes/_authenticated.erp.production.tracking.tsx`: renombrar labels y hacer `Cuenta de cobro`, `Planimetría`, `Entrega prometida al cliente` de solo lectura; renombrar "Real" → "Entrega real (último producto)".
  - `src/routes/_authenticated.erp.my-tasks.tsx`: para tipos `partial_shipment` e `invoice_ready_for_collection`, mostrar checkbox "Forms enviado y saldo cobrado" + botón "Marcar completada" que llama a `mark_task_forms_done`. Eliminar botón "Visto" para estos dos tipos.
  - Añadir CTA "Abrir Forms" con la URL guardada.
- Backfills SQL para Montenegro-001 y para cualquier OP existente con esos huecos.

## Riesgos / preguntas abiertas

- Necesito la URL exacta del Forms externo para el CTA. Si prefieres, la dejo configurable en `brand_production_settings.forms_url` y me indicas después la URL a cargar por marca.
