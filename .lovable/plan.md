# Plan: JD-N06 Envíos parciales + Auditoría Responsive Móvil

Dos entregables, en orden. Para ahorrar créditos, ejecuto ambos en pasadas focalizadas (sin re-lecturas innecesarias) y agrupo edits en paralelo.

---

## Parte 1 — JD-N06: Envíos parciales por ítem

**Regla actual (no se rompe):** una factura solo pasa a logística cuando TODOS sus ítems están terminados, y el saldo (50% restante) solo se cobra al entregar todo.

**Cambio propuesto (excepción documentada):** habilitar un checkbox por `order_item` llamado **"Gestión de envío parcial"** que exime a ese ítem de la regla maestra.

### Base de datos (una sola migración)
- `order_items`: agregar
  - `partial_shipment_enabled boolean default false`
  - `partial_shipment_enabled_at timestamptz`
  - `partial_shipment_enabled_by uuid`
  - `partial_delivered_at timestamptz` (cuando ese ítem individual se entrega)
- `order_item_partial_log` (auditoría): `id, order_id, order_item_id, action (enabled|disabled|delivered), actor_id, actor_email, note, created_at`. RLS: read authenticated, all service_role. GRANTs correctos.
- **RPC `toggle_item_partial_shipment(p_item_id, p_enabled, p_note)`**:
  - Solo `admin` o el vendedor asignado a la orden (usa `has_role` + `orders.seller_id`).
  - **Nunca producción** (validación explícita: si el actor tiene solo rol `production`, rechaza).
  - Al activar: escribe log, crea `seller_tasks` para producción ("Se aprobó entrega parcial del ítem X de factura #Y") y para el vendedor ("Coordinar entrega parcial de ítem X con el cliente").
  - Al desactivar: log + task de reversión.
- **Función `can_send_order_to_logistics(p_order_id) → boolean`**: true si todos los ítems `NO partial_shipment_enabled` están terminados. Los ítems con parcial activado pueden entrar a logística de forma independiente aunque el resto no esté listo.
- **Función `can_collect_final_balance(p_order_id) → boolean`**: true solo cuando TODOS los ítems (parciales incluidos) tienen `partial_delivered_at IS NOT NULL` o entrega registrada — el cobro total sigue bloqueado hasta que todo esté entregado.

### UI
- **Order detail (`_authenticated.erp.orders.$id.tsx`)**: en cada `OrderItemRow`, un checkbox pequeño "Envío parcial" con badge ámbar cuando esté activo. Deshabilitado para rol producción. Modal de confirmación con nota obligatoria (queda en log).
- **Logística**: en la vista de items pendientes, incluir ítems con `partial_shipment_enabled=true` aunque la orden completa no esté terminada. Badge visible "PARCIAL".
- **Historial de factura**: nueva sección "Entregas parciales" que lista qué ítems se entregaron parcialmente y en qué fecha (leyendo `order_item_partial_log` + `partial_delivered_at`).
- **Send to production**: sin cambios — la excepción es solo para la salida a **logística**, no para producción (producción sigue trabajando ítem por ítem como hoy).

### Mejora recomendada aplicable
- Mostrar en el card de la orden un contador "3 de 5 ítems entregados (2 pendientes, 1 parcial)" para que el vendedor vea el estado real sin abrir el detalle.

---

## Parte 2 — Auditoría responsive móvil (ERP global)

**Enfoque económico:** NO reescribir cada componente. Aplicar el patrón responsive del design system (grid + `min-w-0` + `shrink-0` + `truncate`) solo en los puntos que rompen en 375px.

### Método
1. Playwright a 375×812 sobre las rutas principales del ERP:
   - `/erp/dashboard`, `/erp/orders`, `/erp/orders/$id`, `/erp/production`, `/erp/logistics`, `/erp/finance` (invoices, treasury, approvals, commissions), `/erp/warehouse`, `/erp/customers`, `/erp/admin/users`.
2. Screenshots + detección de overflow horizontal (`document.documentElement.scrollWidth > innerWidth`).
3. Lista priorizada de fixes (headers que se salen, tablas sin scroll, calendarios que se desbordan, cards con paddings fijos, botones apilables).

### Fixes estándar que aplicaré
- Headers de página: `grid grid-cols-[minmax(0,1fr)_auto] sm:flex` con `min-w-0` y `truncate`.
- Tablas anchas: envolver en `<div className="-mx-4 overflow-x-auto sm:mx-0">` cuando no quepan.
- KPIs/cards: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` en lugar de fijos.
- Filtros de fecha (el bug que reportaste en tesorería y similares): mover popovers a `align="end"` con `w-[calc(100vw-2rem)] sm:w-auto` para no desbordar.
- Diálogos: `max-w-[calc(100vw-2rem)]` + `max-h-[calc(100dvh-2rem)] overflow-y-auto`.
- Botones de acción en headers: `w-full sm:w-auto` cuando sean más de 2.

### Entregable
- Un solo commit con todos los fixes agrupados por archivo (parallel edits).
- Reporte final: rutas auditadas + fixes aplicados + rutas que quedaron limpias sin tocar.

---

## Orden de ejecución
1. Parte 1 completa (migración + RPCs + UI + logística + historial).
2. Parte 2 (audit + fixes en un solo lote).

## Preguntas rápidas (defaults asumidos si no respondes)
- **¿Producción puede ver el checkbox aunque no pueda activarlo?** Default: **sí, ve el estado pero está disabled con tooltip "Solo admin o vendedor"**.
- **¿El ítem parcial permite cobrar su valor prorrateado o solo se cobra al final?** Default: **solo se cobra el total al final**, respetando la regla maestra (lo que dice el requerimiento).
- **¿Auditoría solo móvil o también tablet?** Default: **priorizo móvil 375px**, tablet 768px como pasada rápida final.

Confirma y arranco.
