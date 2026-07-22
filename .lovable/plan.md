
## Objetivo

Cambiar la forma de registrar **Inicio de producción** y **Terminado** en el ERP:

- Ya no serán botones "Inicio hoy" / "Marcar terminado" que ponen la fecha actual automáticamente.
- El usuario de producción escribirá la **fecha** en un campo, y aparecerá un **diálogo de confirmación** para validar antes de guardar (doble validación).
- Aplica **por producto individual** — sin fases, con fases (cada fase su propia fecha), y para productos vinculados (parent/child).
- **Desacoplar producción del pago a proveedor**: producción ya NO tendrá que esperar a que finanzas registre el anticipo. El módulo de "Pagos a proveedor" seguirá recibiendo pendientes y podrá registrar pagos, pero eso no bloqueará ni disparará fechas de producción.

No se modifica: creación de ventas, aprobación de OP, planimetrías, notificaciones (más allá de las que ya se disparan al terminar), márgenes, costos, ni flujo financiero de facturación.

## Cambios en frontend

### 1. Nuevo componente `DateConfirmField` (compartido)

Archivo nuevo: `src/features/production/date-confirm-field.tsx`

- Campo `<input type="date">` editable.
- Al `onBlur` o `onChange`, si el valor cambia, abre un `AlertDialog` con el texto de confirmación adecuado y los textos:
  - "¿Confirmar **{label}** como {fecha formateada en es-CO}?"
  - Botones: Cancelar / Sí, confirmar.
- Al confirmar, ejecuta `onSave(dateISO)`; al cancelar, revierte al valor anterior.
- Soporta modo "solo lectura" cuando ya está terminado (mostrar valor + badge).
- Props: `label`, `value`, `onSave`, `disabled`, `variant` ("inicio" | "terminado" | "generic"), `confirmDescription?`.

### 2. `src/routes/_authenticated.erp.production.tracking.tsx` (ExpandedItem, líneas ~924–1015)

- Reemplazar el botón "🚀 Inicio hoy" y toda la lógica `startProd` por un `DateConfirmField` para `production_started_at`.
- Reemplazar `<FinishItemButton>` por un `DateConfirmField` para `production_finished_at`.
  - Al confirmar la fecha de terminado, en lugar de llamar el RPC `mark_order_item_finished` con hoy, hacer un `patchItem` con `{ production_finished_at: <fecha>, production_finished_by_email: <email actual> }` **y** llamar al RPC existente para preservar los efectos (notificaciones al vendedor, actualización de estado global, tarea de cobro). Ver "RPC" abajo.
- **Quitar el bloqueo por `requires_advance_payment`**: eliminar el ramal que mostraba "Requiere pago anticipado ↓" y bloqueaba el inicio. El `DateConfirmField` de inicio siempre estará editable para usuarios con permiso.
- `SupplierAdvancePaymentCard` / `SupplierAdvancePaymentNotice` / `SupplierAdvancePaymentForm` / `SupplierQuickPaymentCheck` siguen mostrándose como informativos/registrables — pero **no** condicionan `production_started_at`.
- Eliminar `startProd` (mutación) y su prop en `ExpandedPanel` / `ExpandedItem`.

### 3. `src/features/production/item-phases-tracking.tsx` (PhaseRow, líneas ~264–315)

- Reemplazar `DateInline` de "Real prov." se mantiene igual (es dato del proveedor).
- Reemplazar el botón "Inicio hoy" por un `DateConfirmField` para el inicio real de la fase (campo `started_at`, y si se quiere seguir marcando `status`, lo hace la misma mutación cuando la fecha se confirma → status `en_proceso`).
- Reemplazar el botón "Marcar terminada" por un `DateConfirmField` para `finished_at`; al confirmar, la mutación guarda `finished_at: <fecha>` y `status: 'terminado'`.
- Cada fase es 100% independiente (ya lo era, se conserva).

### 4. `src/features/production/finish-item-button.tsx`

- Marcarlo como **deprecado** y dejar de importarlo desde tracking. No borrar aún (se puede usar en otro sitio; se removerá si no queda ningún uso).

### 5. Pagos a proveedor

- No se modifica `src/routes/_authenticated.erp.finance.supplier-payments.tsx` ni `src/lib/supplier-advance-payments.functions.ts`. Los pendientes se siguen listando por `ready_for_advance_payment`.
- Solo se desacopla el **efecto UI** en tracking: ya no oculta el inicio de producción.

## Cambios en base de datos (migración)

Una sola migración con:

1. **RPC `set_order_item_production_dates(_item_id uuid, _started_at date, _finished_at date)`** (SECURITY DEFINER):
   - Valida permisos (rol `operativo` o `admin`).
   - Setea `production_started_at`, `production_finished_at`, `production_finished_by_email` cuando se pase.
   - Cuando `_finished_at` sea NOT NULL y antes fuera NULL, reutiliza la lógica actual de `mark_order_item_finished` (notificación al vendedor, tarea de cobro, actualización de estado de OP si todos los items están terminados).
   - Cuando `_finished_at` sea NULL y antes NOT NULL, requiere `_reason` opcional (o dejamos `unmark_order_item_finished` como está y solo lo llamamos desde el ya existente diálogo administrativo).
2. **Trigger `tg_order_items_no_advance_payment_block`** — ninguno nuevo. Se elimina cualquier trigger que ponga `production_started_at` automáticamente al registrar pago anticipado. Buscar y remover si existe (revisar `handle_supplier_advance_payment` / similares) — si solo actualiza `ready_for_advance_payment`, se conserva; si toca `production_started_at`, se elimina esa parte.
3. Nueva RPC `set_order_item_phase_dates(_phase_id uuid, _started_at timestamptz, _finished_at timestamptz)` con la misma idea para fases (opcional: si el `UPDATE` directo con RLS ya funciona, se omite).

## Nuevas server functions

Archivo nuevo: `src/lib/order-items-production-dates.functions.ts`

- `setOrderItemProductionDates({ itemId, startedAt, finishedAt })` — envuelve el RPC.
- Usa `requireSupabaseAuth`.

Reemplazan a `markOrderItemFinished` en el flujo nuevo (se conserva `mark_order_item_finished` para compatibilidad y `unmark_order_item_finished` para el reverso administrativo).

## Comportamiento resultante

- El usuario de producción ve tres campos de fecha en cada producto/fase: **Prom. proveedor**, **Real proveedor**, **Inicio producción**, **Terminado**. Cada uno editable; al cambiar aparece diálogo "¿Confirmar {label} como {fecha}?".
- Ya no hay botones "🚀 Inicio hoy" ni "✓ Marcar terminado".
- Si el proveedor requiere pago anticipado, sigue viéndose el aviso y el formulario para finanzas, pero producción puede registrar el inicio cuando quiera.
- Finanzas puede registrar pagos igual que antes; no afecta las fechas de producción.

## Cómo probar (al final)

1. Ir a **Seguimiento de producción → un producto sin fases**: cambiar la fecha de "Inicio prod." → aparece diálogo → confirmar → se guarda.
2. Cambiar la fecha de "Terminado" → aparece diálogo → confirmar → producto queda terminado y notifica al vendedor.
3. Repetir en un producto **con fases** (Mesa de comedor): cada fase debe permitir editar sus propias fechas independientemente.
4. Producto con proveedor de **pago anticipado**: verificar que **puede** iniciarse producción sin haber registrado el pago.
5. Ir a **Finanzas → Pagos a proveedor**: los pendientes deben seguir apareciendo por `ready_for_advance_payment`; registrar un pago allí no debe modificar las fechas de producción.
6. Reversa: como admin, "desmarcar terminado" con motivo debe seguir funcionando.

## Archivos afectados

- `src/features/production/date-confirm-field.tsx` (nuevo)
- `src/features/production/item-phases-tracking.tsx`
- `src/routes/_authenticated.erp.production.tracking.tsx`
- `src/features/production/finish-item-button.tsx` (deja de usarse)
- `src/lib/order-items-production-dates.functions.ts` (nuevo)
- Migración SQL con nuevo RPC y limpieza de cualquier trigger que acoplaba pago↔inicio
