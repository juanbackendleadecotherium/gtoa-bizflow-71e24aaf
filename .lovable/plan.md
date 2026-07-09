## Objetivo
1. Simplificar las fases: son solo un desglose multi-proveedor (mismo momento). Quitar los botones Iniciar/Terminar y el badge de estado.
2. Añadir un check de aprobación explícito de Alejandra para que un producto cotizado pase a la cola de "Pagos a proveedores". Hoy basta con guardar proveedor + costo + fecha de cotización para que aparezca; queremos un paso manual.

## Cambios

### 1. `src/features/production/item-phases-editor.tsx` (y equivalentes de tracking)
- Quitar botones **Iniciar** y **Terminar** y el badge "Pendiente / En proceso / Terminada" de cada fase.
- Mantener: nombre, proveedor, costo, costo renegociado, fechas cotización/prometida, notas, guardar, eliminar.
- Revisar `src/features/production/item-phases-tracking.tsx` para quitar también los botones/estado allí.
- Dejar la tabla `order_item_phases.status` intacta (no romper datos existentes); solo se oculta de la UI.

### 2. Check de aprobación para envío a pagos
- **Migración**: agregar columna `ready_for_advance_payment boolean not null default false` en `public.order_items` (+ opcional `approved_for_payment_at`, `approved_for_payment_by`). No romper datos existentes: en migración, marcar `true` los ítems que YA tienen un `order_item_supplier_payments` de tipo `advance` para no regenerar tareas fantasma. Los demás quedan en `false` (Alejandra los revisa y marca).
- **`listPendingSupplierPayments`** (`src/lib/supplier-advance-payments.functions.ts`): filtrar `.eq("ready_for_advance_payment", true)`.
- **UI en `item-margins-section.tsx`** (donde Alejandra cotiza): junto a proveedor/costo/fecha, un checkbox **"Listo para enviar a pagos"** que sólo se habilita cuando hay proveedor + costo > 0 + fecha de cotización. Al marcarlo, un `UPDATE order_items SET ready_for_advance_payment = true`. Botón para desmarcar mientras no exista pago registrado.
- Mostrar badge visual: "Pendiente de aprobación" vs "Enviado a pagos".
- Auto-desactivar el check si el usuario cambia proveedor/costo tras aprobar (opcional, para forzar re-aprobación). Propuesta: al UPDATE de supplier_id/cost/quotation_date, trigger que resetee `ready_for_advance_payment = false` mientras no haya pago registrado.

### 3. Task `pay_supplier_advance`
- La creación de la tarea (donde exista) debe respetar el mismo filtro `ready_for_advance_payment = true`. Revisar triggers/funciones que generan estas tareas y añadir la condición.

## Fuera de alcance
- No se elimina el estado interno de las fases en BD (por si más adelante se vuelven a usar).
- No se cambia la lógica de margen ni la vinculación padre-hijo.

¿Confirmas para implementar?