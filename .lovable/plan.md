## Objetivo

1. Ventas con solicitud de aprobación gerencial deben nacer con un estado **"Pendiente aprobación gerencia"** (no "Borrador"), y al aprobarse deben moverse automáticamente al siguiente estado operativo. Al rechazarse siguen anulándose como hoy.
2. Reiniciar los consecutivos de factura de **Casa Diseño, Espacio Inmobiliario y Getova** para que la próxima factura sea `-0001`.

---

## Cambios de base de datos (una sola migración)

### A. Nuevo estado por marca

- Insertar (si no existe) el estado **"Pendiente aprobación gerencia"** en `order_statuses` para todas las marcas activas, con `sort_order = -5` (queda entre Borrador `-10` y Pendiente de planimetría `1`) y un color distintivo (ámbar).
- Se hace por `slug` para no depender de IDs; no se toca ningún estado existente.

### B. Trigger que sincroniza `status_id` con `approval_status`

Función `tg_orders_sync_status_on_approval()` que se dispara en `BEFORE INSERT OR UPDATE OF approval_status ON orders`:

- Cuando `approval_status` pasa a **`pendiente`** (o al insertar la orden con ese valor): setear `status_id` al estado "Pendiente aprobación gerencia" de la marca.
- Cuando `approval_status` pasa a **`aprobada`**: si el `status_id` actual sigue siendo "Pendiente aprobación gerencia" o "Borrador", moverlo automáticamente al primer estado operativo disponible según prioridad:
  1. "Pendiente de planimetría" si existe para la marca (default),
  2. si no, "Pendiente Aprob. Produc.".
  Si el usuario ya lo movió manualmente a otro estado (raro), no se sobreescribe.
- Cuando `approval_status` pasa a **`rechazada`**: no hace nada (la función `resolve_management_approval` ya anula la venta).

Esto garantiza que tanto el flujo por creación (`request_approval=true` en el diálogo → trigger `tg_orders_auto_require_approval`) como el manual (`request_management_approval` RPC) queden coordinados con el estado visible en la lista.

### C. Renumerar consecutivo de Casa Diseño

- Renombrar `CD-0002` → `CD-0001` en `orders`, `invoices` e `invoice_versions` (misma técnica de `TMP-*` que ya usamos en la última renumeración de Montenegro), y dejar rastro en `order_audit_log`.
- Limpiar `released_invoice_numbers` para la marca por si quedara algo.
- Con orders volviendo a arrancar en `CD-0001`, la función `allocate_invoice_number` calculará la próxima como `CD-0002` (comportamiento esperado).

### D. Espacio Inmobiliario y Getova

- Verificado: no hay órdenes con `invoice_number` para EM ni GT, y `released_invoice_numbers` está vacío para ambos. La próxima factura ya arrancará en `EM-0001` / `GT-0001` sin cambios adicionales.
- La migración incluye un `DELETE ... WHERE brand_id IN (EM, GT)` de `released_invoice_numbers` como salvaguarda idempotente.

---

## Cambios de código (frontend)

### `src/features/customers/new-customer-dialog.tsx`

En la mutación de creación de venta (líneas 502-568):

- Si `draft.order.sale_type === "normal" && draft.order.request_approval === true`, seleccionar el estado "Pendiente aprobación gerencia" de la marca en lugar del primer `is_active` por `sort_order` (que hoy resuelve a "Borrador").
- Todo lo demás se mantiene igual (payload, trigger de invoice number, llamada posterior a `request_management_approval`).

El trigger nuevo del punto B es redundante en este camino pero necesario para el otro camino (RPC manual desde el detalle de la orden) y para blindar cualquier cambio futuro.

### Resto de UI

- No hay cambios en las badges: `ApprovalStatusBadge` sigue mostrando "Aprobación pendiente" como chip aparte del estado principal, y ahora el estado principal reforzará el mensaje ("Pendiente aprobación gerencia" en vez de "Borrador").
- No se toca la pantalla de aprobaciones (`/erp/finance/approvals`): sigue leyendo `approval_status = 'pendiente'`.

---

## Validación posterior

1. Crear una venta normal con anticipo < 50% y marcar "Solicitar aprobación gerencia" → verificar en el listado de Ventas que aparece como "Pendiente aprobación gerencia" + chip "Aprobación pendiente".
2. Aprobar desde gerencia → verificar que el estado principal cambia solo a "Pendiente de planimetría".
3. Crear una nueva factura en Casa Diseño → debe salir `CD-0002` (después de la renumeración de la existente a `CD-0001`).
4. Crear la primera factura de Espacio Inmobiliario y Getova → deben salir `EM-0001` y `GT-0001`.
