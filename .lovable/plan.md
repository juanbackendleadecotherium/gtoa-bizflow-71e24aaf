
## Objetivo

1. Cuando finanzas registra un pago al proveedor, **NO** iniciar producción automáticamente.
2. En vez de eso, enviar una **notificación al encargado de producción** (rol `operativo` con acceso a la marca — Alejandra) indicando el monto/porcentaje pagado y pidiéndole que se lo comparta al proveedor.
3. El botón **"Inicio hoy"** (marcar `production_started_at`) queda 100% manual — solo Alejandra desde Seguimiento.
4. En productos con **fases** (multi-proveedor), agregar un botón **"Inicio hoy"** en **cada fase** para marcar el inicio real de esa fase individualmente.

---

## Cambios

### 1) Migración SQL

**a) Modificar `public.start_real_production(uuid, timestamptz)`**
- Quitar el guard que exige pago anticipado registrado (`RAISE EXCEPTION 'requiere pago anticipado...'`). Ahora Alejandra puede iniciar cuando quiera, sin importar si el pago se registró primero.
- El resto de la lógica (task `production_started` al vendedor, actualizar `production_due_date`, `production_start_date`) se mantiene.

**b) Modificar `confirm_supplier_advance_payment` (server function) — ver §2:**
- Eliminar la llamada a `supabase.rpc("start_real_production", …)`.
- En su lugar, insertar un `seller_task` nuevo tipo `supplier_paid_notify` dirigido al encargado.

**c) Nuevo tipo de tarea `supplier_paid_notify`**
- No requiere cambio de esquema (la columna `type` es `text`).
- Un helper SQL `public.notify_operativo_supplier_paid(p_item_id uuid, p_amount numeric, p_pct numeric)` que:
  - Resuelve marca, producto, proveedor, y cantidades.
  - Inserta un `seller_task` por cada usuario con rol `operativo` que tenga acceso a la marca (via `has_brand_access`). Fallback: si no hay operativo, inserta uno para cada admin de la marca.
  - Título: *"Pago a proveedor realizado — comparte al proveedor"*.
  - Reason incluye: producto, proveedor, monto pagado, % del costo, factura/orden.
  - `severity = 'info'`, `status = 'pendiente'`.

**d) Fases: agregar columna `started_at_manual` no aplica** — la tabla `order_item_phases` ya tiene `started_at` y `supplier_actual_date`. Reutilizamos `supplier_actual_date` como "fecha real de esa fase" (que ya existe en la UI). El botón "Inicio hoy" seteará `supplier_actual_date = today()` si está vacía. No requiere migración.

### 2) Server function `src/lib/supplier-advance-payments.functions.ts`

- Reemplazar el bloque final de `confirmSupplierAdvancePayment` (líneas 98-105):
  - Quitar el `rpc("start_real_production", …)`.
  - Llamar en su lugar a `rpc("notify_operativo_supplier_paid", { p_item_id, p_amount, p_pct })`.
- Devolver `payment` como hoy.

### 3) UI de Seguimiento — `src/routes/_authenticated.erp.production.tracking.tsx`

- El botón "Inicio hoy" a nivel de producto ya existe (líneas 810-836 y 907-937) — se mantiene igual.
- Toast en `SupplierAdvancePaymentForm` (línea 71): cambiar *"Pago confirmado. Producción iniciada."* → *"Pago registrado. Se notificó al encargado de producción."*

### 4) Fases — `src/features/production/item-phases-tracking.tsx`

En cada `<PhaseRow>` agregar un botón compacto **"Inicio hoy"** que:
- Aparece solo si `phase.supplier_actual_date` está vacía.
- Al hacer clic: `savePatch.mutate({ supplier_actual_date: today })` (formato `YYYY-MM-DD`).
- Ícono cohete + texto, alineado a la derecha del bloque de fechas.
- Cuando ya existe fecha real, se oculta el botón (la fecha misma queda editable).

### 5) Panel de tareas — `src/features/seller-tasks/seller-tasks-panel.tsx` (verificación)

- El panel ya renderiza cualquier `seller_task`. El nuevo tipo `supplier_paid_notify` se mostrará automáticamente. Si hay un mapa de íconos/colores por `type`, agregar entrada `supplier_paid_notify` (💰, azul).

---

## Notas técnicas

- **"Encargado del producto" = rol `operativo` con acceso a la marca.** Hoy el archivo `brand-owners.ts` es solo texto UI. La notificación real se resuelve por rol + `has_brand_access(user_id, brand_id)`, así funciona tanto para Alejandra como para Jonathan sin cambiar código cuando entren usuarios nuevos.
- La migración es **reversible en criterio**: si Alejandra prefiere volver al auto-start, basta con re-agregar la llamada `rpc("start_real_production")` en la server function.
- No se toca el flujo de aprobación de cotizaciones (`ready_for_advance_payment`) ni la bandeja de finanzas.

## Archivos afectados

- `supabase/migrations/<nueva>.sql` (redefinir `start_real_production`, crear `notify_operativo_supplier_paid`)
- `src/lib/supplier-advance-payments.functions.ts`
- `src/features/production/supplier-advance-payment-form.tsx` (solo el toast)
- `src/features/production/item-phases-tracking.tsx` (botón por fase)
- `src/features/seller-tasks/seller-tasks-panel.tsx` (icono opcional para el nuevo tipo)
