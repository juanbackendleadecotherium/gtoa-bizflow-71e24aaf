## Objetivo

Conectar la aprobación de cotización de proveedor externo con el gerente financiero: al guardarla se genera automáticamente una tarea de pago para finanzas; solo finanzas puede registrar el pago; ese registro se convierte en la fecha oficial de inicio de fabricación y notifica al creador de la orden de producción.

## Cambios en base de datos

### 1. Extender `seller_tasks` con un nuevo tipo
- Nuevo `type = 'pay_supplier_advance'` (asignado al rol `finanzas`).
- Nuevo `type = 'supplier_advance_paid'` (asignado a quien creó la orden de producción).
- Campos existentes cubren todo; solo se agregan estos valores.

### 2. Nueva función `create_supplier_payment_tasks(_item_id uuid)` (security definer)
Inserta una tarea `pay_supplier_advance` por cada usuario con rol `finanzas` (via `user_roles`). Contenido de `reason`:
```
Producto: <descripción> · Factura #<invoice_number|order_number>
Proveedor: <nombre>
Valor a pagar (anticipo <pct>%): $<monto>
Cotización aprobada el <quotation_date>
```
Idempotente: si ya existe una tarea `pay_supplier_advance` pendiente para ese `order_item_id`, no la duplica.

### 3. Trigger `trg_order_items_quotation_approved`
`AFTER INSERT OR UPDATE OF supplier_id, negotiated_cost, manufacturing_cost, quotation_date ON order_items`:
- Se ejecuta cuando: `supplier_id IS NOT NULL` AND (`negotiated_cost IS NOT NULL` OR `manufacturing_cost IS NOT NULL`) AND `quotation_date IS NOT NULL` AND aún no existe pago en `order_item_supplier_payments`.
- Aplica a todos los proveedores externos (ignora el flag `requires_advance_payment` para el trigger).
- Llama a `create_supplier_payment_tasks(NEW.id)`.

### 4. RLS estricto en `order_item_supplier_payments`
- Reemplazar el `INSERT` policy para exigir `has_role(auth.uid(), 'finanzas') OR has_role(auth.uid(), 'admin')`.
- `SELECT` sigue abierto a quien tiene acceso a la marca (producción puede ver estado).
- Sin política de UPDATE ni DELETE (ya inexistentes, se confirma).

### 5. Ampliar `confirm_supplier_final_payment` no aplica aquí (es otro flujo); esta feature usa `confirmSupplierAdvancePayment` existente.

### 6. Trigger post-pago: notificar a producción
Nuevo trigger `AFTER INSERT ON order_item_supplier_payments` (cuando `payment_type = 'advance'`):
- Resuelve tarea(s) `pay_supplier_advance` de ese `order_item_id` → `status = 'resuelta'`.
- Inserta tarea `supplier_advance_paid` para `production_orders.created_by` del ítem, con `reason` incluyendo fecha real del pago y "Puedes iniciar fabricación desde <fecha>".
- El RPC `start_real_production` ya se llama desde el server function, así que la fecha se persiste igual.

## Cambios en código server

### `src/lib/supplier-advance-payments.functions.ts`
- En `confirmSupplierAdvancePayment.handler`: verificar `has_role(userId, 'finanzas' | 'admin')` antes del insert; si no, lanzar "Solo el gerente financiero puede registrar este pago".
- Nueva función `listPendingSupplierPayments`: devuelve todos los ítems con cotización aprobada y sin pago, con brand, invoice, product, supplier, suggested_amount, quotation_date, order_id, order_item_id.
- Nueva función `getSupplierPaymentsSummary`: total_pendiente (COP), count.

## Cambios en UI

### 1. Nueva ruta `/erp/finance/supplier-payments`
Página protegida bajo `_authenticated`, visible solo si `roles` incluye `finanzas` o `admin`.

- **Encabezado**: tarjeta grande con "Total pendiente a proveedores: $X" y contador de pagos.
- **Filtros**: marca, proveedor, buscador por producto/factura.
- **Tabla** (una fila por ítem pendiente):
  - Producto (truncado) · Factura # · Proveedor · Valor a pagar (anticipo sugerido) · Fecha aprobación · botón "Registrar pago".
- **Registrar pago**: abre un `Dialog` con el `SupplierAdvancePaymentForm` existente (reutilizado), sin cambios visuales. Al confirmar, refresca la lista y el total.

### 2. Sidebar (nav ERP)
Nuevo item "Pagos a proveedores" bajo Finanzas, visible con rol `finanzas`/`admin`. Badge numérico con la cantidad de pagos pendientes (consulta ligera cacheada 30s).

### 3. Panel de tareas (`/erp/my-tasks`)
Renderizado especial para `type = 'pay_supplier_advance'`:
- Card verde-azul con icono `DollarSign`, mostrando producto/factura/proveedor/monto/fecha.
- CTA "Ir a pagos a proveedores" que navega a la nueva ruta filtrada por ese ítem.

Renderizado para `type = 'supplier_advance_paid'`:
- Card azul informativa "Pago confirmado — puedes iniciar fabricación desde <fecha>".
- Botón "Visto" (marcar como resuelta), como los `production_started` actuales.

### 4. Panel de producción existente
En `src/routes/_authenticated.erp.production.tracking.tsx` y donde aparece `SupplierAdvancePaymentForm` para roles no-finanzas: ocultar el formulario y mostrar un estado read-only "Pendiente de pago al proveedor por finanzas" con la fecha en que se aprobó la cotización.

### 5. Estado "en fabricación"
La lógica actual ya usa `production_started_at` (seteado por `start_real_production` en el pago). No cambia: mientras no haya pago, `production_started_at` es NULL y no aparece como "en fabricación". Verificar en `real-production` y `production.tracking` que las vistas respeten esto (spot check, no requiere cambios previstos).

## Consideraciones técnicas

- El trigger se dispara en `AFTER UPDATE` sobre columnas específicas para no ejecutarse en cada save irrelevante.
- Idempotencia: si producción reabre la cotización y vuelve a guardar sin cambios materiales, no se duplica la tarea.
- Si producción **cambia** el proveedor o el costo antes de que finanzas pague: la tarea pendiente se debe actualizar (nuevo `reason` y monto). Se resuelve borrando la tarea anterior no-resuelta y creando la nueva dentro de `create_supplier_payment_tasks` (delete-and-insert cuando ya existe pendiente y algún dato cambió).
- Grants: `GRANT EXECUTE` de las nuevas funciones a `authenticated`.
- Sin reversión en UI (regla explícita del usuario). Corrección manual = SQL admin.

## Archivos afectados

- **Nueva migración SQL**: trigger, función, RLS, valores de enum implícitos (los `type` son texto libre en `seller_tasks`, no requiere cambio de enum).
- `src/lib/supplier-advance-payments.functions.ts`: agregar `listPendingSupplierPayments`, `getSupplierPaymentsSummary`, y guard de rol en `confirmSupplierAdvancePayment`.
- **Nuevo**: `src/routes/_authenticated.erp.finance.supplier-payments.tsx`.
- `src/routes/_authenticated.erp.my-tasks.tsx`: renderizado especial para los nuevos tipos.
- `src/routes/_authenticated.erp.tsx` (sidebar): item "Pagos a proveedores" con badge.
- `src/routes/_authenticated.erp.production.tracking.tsx`: ocultar formulario para no-finanzas y mostrar estado.

## Fuera de alcance (por decisión del usuario)

- Reversión de pagos desde la UI.
- Notificación a otros roles distintos a "quien creó la orden de producción".
- Cambios al flujo de pago final (`confirm_supplier_final_payment`), que sigue como está.