
# Replan ERP Grupo Getova — alineado al flujo operativo real

Reorganizamos el roadmap para que cada hito corresponda a una etapa real del flujo (WhatsApp → vendedor → anticipo → factura propia → planimetría → producción/terceros → logística → entrega → garantía). Lo ya construido (auth, marcas, roles, clientes, pedidos, estados configurables) queda como base del Hito 1 y se ajusta, no se reescribe.

---

## Lo que YA está hecho y se reaprovecha

- Autenticación + roles (`admin`, `ventas`, `comercial`…) y acceso por marca (`user_brands`, `has_brand_access`, `can_write_brand`).
- Marcas con tema/colores.
- Tablas: `customers`, `orders`, `order_items`, `order_statuses` (configurables por marca), `order_status_history`.
- Layout ERP con selector de marca, sidebar, rutas: dashboard, clientes, pedidos, estados.

Esto cubre ~80% del Hito 1. Sólo faltan ajustes de campos y el rol "vendedor" explícito.

---

## HITO 1 — Cierre de base comercial (ajustes pequeños)

**Objetivo:** dejar el registro de pedidos listo para conectar con WhatsApp IA y con facturación propia.

- Añadir a `orders`: `seller_id` (vendedor responsable, FK profiles), `source` (`whatsapp` | `manual` | `comercial`), `whatsapp_raw` (texto pegado original), `estimated_delivery_date`.
- Añadir a `customers`: índice en `phone` para búsqueda rápida desde la captura IA.
- Nuevo rol `vendedor` (si no existe en `app_role`) y vista "Mis pedidos" para vendedores.
- UI: filtros por vendedor y por origen en `/erp/orders`.

---

## HITO 2 — Captura inteligente desde WhatsApp (IA)

**Objetivo:** que un vendedor cree un pedido completo pegando la conversación de WhatsApp.

- Ruta `/erp/orders/new/whatsapp` con `<textarea>` para pegar el chat.
- Server function `parseWhatsAppOrder` usando **Lovable AI Gateway** (`google/gemini-3-flash-preview`) con `Output.object` (Zod) que extrae:
  - `customer { display_name, phone, address, city }`
  - `items[] { description, quantity, unit_price }`
  - `notes`, `total_estimated`
- Vista de revisión editable: si el teléfono coincide con un cliente existente, lo sugiere; si no, crea cliente nuevo.
- Guarda el texto original en `orders.whatsapp_raw` para auditoría.

---

## HITO 3 — Facturación propia + anticipos (reemplaza Alegra)

**Objetivo:** sistema de facturación propio, validación del 50% de anticipo, y dashboard financiero por vendedor/marca para gerencia.

### 3.1 Modelo
- `invoices`: id, brand_id, order_id, invoice_number (auto por marca, formato `SLUG-FAC-YYYY-000001`), issued_at, due_date, subtotal, tax, total, status (`borrador`, `emitida`, `parcial`, `pagada`, `anulada`), pdf_url, notes.
- `invoice_items`: snapshot de los items del pedido al momento de facturar.
- `payments`: id, invoice_id, order_id, amount, method (`transferencia`, `efectivo`, `tarjeta`, `otro`), reference, paid_at, registered_by, receipt_url.
- Triggers: numeración automática, recálculo de `invoices.status` según pagos, recálculo de `orders.advance_amount` y `advance_percentage`.

### 3.2 Regla de anticipo 50%
- Trigger en transición de estado: para mover un pedido del estado inicial al siguiente, exige `advance_percentage >= 50%` (admin puede forzar con nota justificativa).

### 3.3 UI
- `/erp/invoices` — listado + filtros (marca, vendedor, estado, fecha).
- `/erp/invoices/$id` — detalle + registro de pagos + generación PDF (usando `react-pdf` o similar, almacenado en Storage).
- Panel "Pagos / Anticipos" en el detalle del pedido.
- `/erp/dashboard/finance` (gerencia): KPIs por vendedor y por marca — total facturado, total cobrado, cartera pendiente, % cumplimiento de anticipos, ranking de vendedores. Gráficas con `recharts`.

---

## HITO 4 — Planimetrías + producción + terceros

**Objetivo:** convertir un pedido facturado en planimetría trazable, cotizada con terceros, con novedades durante los ~45 días de producción.

### 4.1 Modelo
- `planimetrias`: id, order_id, brand_id, version, estimated_date, status (`borrador`, `enviada_produccion`, `cotizando`, `aprobada`, `rechazada`, `en_produccion`, `terminada`), notes, created_by.
- `planimetria_items`: descripción, cantidad, specs (jsonb), sort_order.
- `planimetria_images`: bucket Supabase Storage privado (`planimetrias/{brand}/{id}/...`).
- `planimetria_templates`: plantillas por marca (estructura JSON) para acelerar la carga.
- `third_parties`: id, brand_id, name (Montenegro Atelier, Ebanistería…), contact, specialty.
- `third_party_quotes`: planimetria_id, third_party_id, amount, lead_time_days, status (`pendiente`, `aprobada`, `rechazada`), file_url, notes.
- `production_events` (novedades): planimetria_id, type (`daño`, `retraso`, `observación`, `cambio_alcance`), description, occurred_at, reported_by, attachments.

### 4.2 UI
- `/erp/production` — tablero por estado de planimetría (kanban simple con botones de avance).
- `/erp/production/$id` — detalle: items, imágenes (drag & drop), cotizaciones, timeline de novedades.
- `/erp/settings/third-parties` (admin) — CRUD terceros.
- `/erp/settings/planimetria-templates` (admin).
- Devolución a vendedor cuando una cotización es rechazada → estado `rechazada` + notificación visual.
- Timeline unificado en el detalle del pedido: estados + planimetría + cotizaciones + novedades.

---

## HITO 5 — Logística: recepción, bodega y entregas

**Objetivo:** controlar lo que llega del taller, dónde se guarda y cómo se entrega con acta firmada.

### 5.1 Modelo
- `warehouse_receipts`: planimetria_id, received_at, received_by, condition (`ok`, `con_observaciones`, `dañado`), acta_url, notes.
- `warehouse_locations`: brand_id, code, description.
- `warehouse_stock`: receipt_id, location_id, status (`en_bodega`, `despachado`, `entregado`).
- `deliveries`: order_id, type (`directa_taller`, `desde_bodega`), scheduled_at, delivered_at, address, courier, status, acta_cliente_url, client_signature_url.

### 5.2 UI
- `/erp/logistics/receipts` — registrar recepción + subir acta.
- `/erp/logistics/warehouse` — vista por ubicación.
- `/erp/logistics/deliveries` — programar y cerrar entregas.
- Captura de firma del cliente (canvas → PNG → Storage) en pantalla de entrega.

---

## HITO 6 — Garantías y cierre postventa

**Objetivo:** capturar incidencias después de entrega y cerrar el ciclo.

### 6.1 Modelo
- `warranty_cases`: order_id, opened_at, opened_by, type (`garantía`, `reproceso`, `queja`), description, status (`abierto`, `en_revisión`, `en_reproceso`, `resuelto`, `rechazado`), resolved_at, resolution_notes.
- `warranty_events`: timeline de acciones.
- `customer_satisfaction`: order_id, score (1-5), comment, captured_at.

### 6.2 UI
- `/erp/warranties` — listado + filtros.
- Botón "Abrir garantía" desde detalle de pedido entregado.
- Encuesta de satisfacción ligera (link público con token o registro manual).
- Cierre formal del pedido cuando no quedan garantías abiertas.

---

## HITO 7 (post-MVP) — Asistencia IA en planimetrías + dashboards avanzados

Sólo cuando 1–6 estén estables:
- IA para sugerir estructura de planimetría desde fotos/descripción del cliente.
- Notificaciones (WhatsApp/email) a cliente y áreas internas.
- KPIs avanzados: tiempos por estado, % retrasos, terceros con más rechazos, satisfacción promedio.

---

## Principios técnicos que mantenemos

- **Multi-marca con RLS** en cada tabla nueva (`brand_id` + `has_brand_access` / `can_write_brand`).
- **Server functions** (`createServerFn` + `requireSupabaseAuth`) — nada de queries directas desde componentes para los nuevos módulos.
- **Storage privado** por marca para planimetrías, actas, firmas, evidencias.
- **IA** vía Lovable AI Gateway con `Output.object` (Zod).
- **Estados configurables** por marca también para planimetría, logística y garantías.

---

## Preguntas antes de arrancar build

1. **Anticipo 50%:** ¿estricto siempre, o admin puede forzar avance con nota justificativa?
2. **Facturación propia:** ¿numeración única global o por marca (`GTO-FAC-2026-000001`, `MON-FAC-2026-000001`)? ¿Maneja IVA / retenciones colombianas o por ahora factura simple?
3. **Terceros:** ¿la lista de terceros es compartida entre marcas o cada marca tiene los suyos?
4. **Plantillas de planimetría:** ¿tienes algún PDF/Excel de ejemplo que pueda usar como base de estructura?
5. **Orden de ejecución:** ¿arrancamos por **Hito 2 (WhatsApp IA)** o por **Hito 3 (facturación + anticipos)**? Mi recomendación: **Hito 1 (ajustes) + Hito 3 (facturación + anticipos)** primero, porque desbloquea el dashboard financiero que pidió gerencia, y luego Hito 2 (WhatsApp IA) para acelerar la captura.

Con tus respuestas paso a build mode y empiezo por lo que decidas.
