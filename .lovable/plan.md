
# Plan · Entrega diferida + Módulo Tesorería

Dos features independientes, foco distinto pero comparten la orden como raíz.

---

## 1) Entrega diferida — el recaudo se ancla a la semana del pago, no de la entrega

### Regla de negocio (resumen)

- El recaudo semanal (KPI 4) agrupa por **fecha de pago (`order_payments.paid_at`)**, no por fecha de entrega.
- Cada `order` tendrá dos fechas separadas:
  - `estimated_delivery_date` → fecha pactada original (ya existe).
  - **`scheduled_delivery_date`** → fecha real a la que el cliente aceptó recibir (nueva).
- El vendedor puede marcar la venta como **entrega diferida** con:
  - Nueva fecha (`scheduled_delivery_date`).
  - Motivo (texto).
  - Marca `is_deferred_delivery` (bool).
- La logística usa `scheduled_delivery_date` para programar; el reporte de recaudo sigue usando `paid_at`.
- Regla maestra: **el saldo ya cobrado NUNCA se revierte al diferir la entrega**. Aplazar solo mueve la entrega física.
- Caso inverso (cliente pagará al recibir): el pago sencillamente aún no existe en `order_payments` → cae en la semana en que se registre. No requiere lógica extra; solo debe poder diferirse la entrega sin exigir saldo cero.

### Cambios de datos (migración)

En `public.orders`:
- `scheduled_delivery_date date` (nullable; default = `estimated_delivery_date` vía trigger cuando se crea).
- `is_deferred_delivery boolean not null default false`.
- `deferred_reason text`.
- `deferred_at timestamptz`, `deferred_by uuid`.

Nueva tabla `order_delivery_deferrals` (historial/auditoría de cada aplazamiento):
- `order_id`, `previous_date`, `new_date`, `reason`, `created_by`, `created_at`.
- RLS: admin/finanzas leen todo; vendedor lee las de sus órdenes.
- GRANT correspondientes a `authenticated` y `service_role`.

RPC:
- `defer_order_delivery(order_id, new_date, reason)` — valida rol vendedor/admin, escribe orden + historial, dispara `seller_task` para logística/finanzas.

### Cambios UI

**Orden (`/erp/orders/$id`)**
- Nuevo bloque "Entrega" con:
  - Fecha pactada (readonly).
  - Fecha programada actual + badge "Diferida" si aplica.
  - Botón "Aplazar entrega" (dialog con date picker + motivo).
  - Historial colapsable de aplazamientos.

**Logística (`real-production.logistica`, `pickups`)**
- Reemplazar cualquier uso de `estimated_delivery_date` por `scheduled_delivery_date ?? estimated_delivery_date` en agrupaciones/columnas.
- Badge "Diferida" visible en las filas afectadas.

**Recaudo semanal (dashboards existentes que usen fecha de entrega)**
- Auditar y forzar `paid_at` como eje de agrupación. Confirmar en `finance.receivables` y en el ejecutivo del warehouse si aplica.

### Notificaciones
- Al diferir: `seller_task` a logística + admin ("Entrega de {order} aplazada del X al Y — motivo: …").

---

## 2) Módulo Tesorería — vista maestra de facturas + registro de pagos

Reemplaza el uso de Alegra: las chicas de tesorería buscan la factura, ven todo el histórico y registran el pago desde nuestro ERP.

### Ruta y acceso
- Nueva ruta: `/_authenticated/erp/finance/treasury` (pestaña "Tesorería" en Finanzas).
- Rol necesario: `finanzas` o `admin`. Añadir rol enum **`tesoreria`** si el usuario quiere separar permisos (a confirmar — ver preguntas).
- Sidebar: aparece dentro de Finanzas, no como módulo raíz (coherente con la decisión previa sobre Comisiones).

### Vista principal (tabla maestra de facturas)
Fuente: `invoices` + join a `orders`, `order_payments`, `customers`, `brands`.

Columnas:
- N° cuenta de cobro / factura.
- Cliente (nombre + doc).
- Marca.
- Vendedor.
- Fecha emisión.
- Total, Recaudado, Saldo.
- Estado: `pendiente | parcial | pagada`.
- Facturación electrónica: `no_facturada | facturada` (nuevo campo, ver abajo).
- Acciones: Ver detalle · Registrar pago · Marcar facturada electrónicamente.

Filtros:
- Buscador (n° factura, n° orden, cliente, doc, teléfono).
- Marca (multi).
- Estado de pago (multi).
- Estado facturación electrónica.
- Rango de fechas (emisión / pago).
- Vendedor.

Exportar a CSV (misma pauta que Receivables).

### Detalle de factura (drawer / sub-ruta)
- Encabezado: cliente, marca, fechas, totales.
- Snapshot de ítems.
- Historial de pagos (`order_payments`): fecha, método, referencia, cuenta destino, quién lo registró, comprobante.
- Historial de auditoría de la factura (envíos, versiones si existen en `invoice_versions`).
- Botones:
  - **Registrar pago** → reusa `PaymentDialog` existente en `src/features/finance/payment-dialog.tsx`.
  - **Marcar como facturada electrónicamente** (Siigo) → dialog con:
    - N° factura electrónica externa.
    - Fecha de emisión electrónica.
    - Observación / URL PDF opcional.
  - **Descargar PDF interno** (ya existe).

### Cambios de datos (migración)

Extender `public.invoices`:
- `electronic_invoice_status text not null default 'no_facturada'` (`no_facturada | facturada`).
- `electronic_invoice_number text`.
- `electronic_invoice_issued_at timestamptz`.
- `electronic_invoice_issued_by uuid`.
- `electronic_invoice_note text`.

Nueva tabla `invoice_electronic_log` (auditoría de marcaciones):
- `invoice_id`, `action` (`marked_facturada | reverted`), `external_number`, `note`, `actor_id`, `actor_email`, `created_at`.
- RLS: solo `finanzas`/`admin`; GRANT a `authenticated` + `service_role`.

RPC:
- `mark_invoice_electronic(invoice_id, external_number, issued_at, note)` — valida rol, actualiza `invoices`, inserta log, dispara notificación al vendedor.
- `revert_invoice_electronic(invoice_id, reason)` — opcional, para corregir.

### Notificaciones
- Al registrar pago desde tesorería → `seller_task` al vendedor ("Pago de {monto} registrado en factura {n°}").
- Al marcar factura electrónica → `seller_task` informativo al vendedor + finanzas.

---

## Detalles técnicos

**Server functions (nuevas)** — `src/lib/`:
- `orders-delivery.functions.ts` → `deferOrderDelivery`, `listDeferrals`.
- `treasury.functions.ts` → `listTreasuryInvoices(filters)`, `getTreasuryInvoice(id)`, `markInvoiceElectronic`, `revertInvoiceElectronic`.

Todas con `.middleware([requireSupabaseAuth])`. Validación rol dentro del handler para las acciones sensibles (Siigo, aplazamiento).

**Rutas nuevas**:
- `src/routes/_authenticated.erp.finance.treasury.tsx` (tabla).
- Tab "Tesorería" agregada en `_authenticated.erp.finance.tsx`.

**Componentes reutilizables**:
- Reusar `PaymentDialog`, `formatMoney`, `AuditRow` (histórico), `Checkbox`, `Dialog`, `Input`, `Select` de shadcn.

**Realtime** (opcional, evaluar): suscripción a `invoices` y `order_payments` en la vista de Tesorería para refrescar la tabla cuando otro usuario registre un pago.

**Ordenamiento y paginación**: por defecto ordenar por `issued_at desc`, límite 200 filas + carga por scroll o paginación (definir en implementación).

---

## Fuera de alcance (confirmar)
- Integración automática con Siigo (API): por ahora solo registro manual del n° de factura electrónica. Se puede añadir después.
- No se toca el cálculo del recaudo de comisiones (comisiones ya usan `paid_at` implícitamente vía `order_payments`).

## Preguntas abiertas
1. ¿Crear rol `tesoreria` separado de `finanzas`, o reusar `finanzas`?
2. Al aplazar entrega, ¿solo puede hacerlo el vendedor asignado a la orden, o cualquier vendedor + admin?
3. ¿Necesitan revertir una "factura electrónica marcada" (por error), o basta con marcarla una sola vez?
