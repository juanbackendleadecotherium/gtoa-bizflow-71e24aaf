## Objetivo

Que cada producto en producción muestre una interfaz distinta según si tiene **un solo proveedor** o **múltiples proveedores (fases)**. Cuando el usuario active "más de un proveedor", los campos de proveedor único (proveedor, costo, fecha cotización, prom/real proveedor, "ya se le pagó al proveedor") deben desaparecer, y solo quedar la sección de fases. Esto debe reflejarse **también** en la vista de Seguimiento de Producción (`/erp/production/tracking`), que hoy solo muestra el layout de proveedor único.

## Cambios

### 1. `ItemCard` en `src/features/production/item-margins-section.tsx` (módulo de márgenes)

- Un toggle superior "Este producto tiene más de un proveedor" ligado a `item.has_phases`.
- Cuando **está apagado** (proveedor único): mostrar la UI actual (costo, proveedor, cotización, negociación, margen) — igual que hoy, sin fases.
- Cuando **está encendido** (multi-proveedor):
  - Ocultar los inputs de proveedor único (`Costo proveedor`, `Proveedor`, `Fecha de cotización`, bloque de negociación).
  - El margen del producto se recalcula sumando `negotiated_cost ?? manufacturing_cost` de todas las fases (ya existe `get_item_effective_cost` en DB; en el cliente usamos el mismo criterio).
  - Mostrar `ItemPhasesEditor` como bloque principal.
- Al activar el toggle: si no hay fases, crear automáticamente la primera fase (para arrancar). Al desactivar: solo permitir si no hay fases; si hay, pedir confirmación y borrarlas.
- Al guardar, además de los campos actuales, actualizar `has_phases` (el trigger de DB ya lo sincroniza, pero el toggle debe persistir el estado inicial cuando aún no hay fases).

### 2. `ExpandedPanel` en `src/routes/_authenticated.erp.production.tracking.tsx` (Seguimiento)

- Cargar también `has_phases` en la consulta de `order_items` (línea ~162).
- Cargar las fases (`order_item_phases`) del item cuando `has_phases = true`, por ítem visible.
- En el render de cada `<li>` del item:
  - Si `!it.has_phases` → mantener el layout actual (proveedor, cotización, costo, prom/real proveedor, botón Inicio hoy, `SupplierAdvancePaymentCard/Notice/Form`, `SupplierQuickPaymentCheck`).
  - Si `it.has_phases` → **reemplazar** ese bloque por un nuevo componente `ItemPhasesTracking` que liste las fases con:
    - Nombre, proveedor, costo efectivo, fecha cotización, prom/real proveedor.
    - Estado (pendiente / en proceso / terminado) y botones **Iniciar / Terminar** fase (RPCs `start_item_phase` / `finish_item_phase` — ya existen).
    - Edición inline de proveedor, costo y fechas por fase (update directo sobre `order_item_phases`).
    - Sección de pago al proveedor **por fase** (usando `phase_id` en `order_item_supplier_payments`, ya soportado). En esta iteración: mostrar el mismo `SupplierQuickPaymentCheck` / `SupplierAdvancePaymentForm` extendidos con `phaseId?` opcional para registrar el pago contra la fase.
  - Al finalizar todas las fases del item, se marca automáticamente el ítem como terminado (trigger nuevo: cuando todas las fases quedan en `terminado`, setear `production_finished_at` en `order_items`).
- Total del ítem en el header sigue siendo el `line_total` (venta); el "costo efectivo" mostrado usa la suma de fases cuando aplica.

### 3. Nuevo componente `src/features/production/item-phases-tracking.tsx`

Versión compacta y en modo "seguimiento" (no editor completo) para usar dentro de `ExpandedPanel`. Reutiliza estilos existentes y llama las mismas mutaciones/RPCs de `ItemPhasesEditor`, pero con densidad de fila-por-fase apropiada para el listado del tracking.

### 4. Extender pagos por fase (mínimo)

- `SupplierAdvancePaymentForm`, `SupplierAdvancePaymentCard` y `SupplierQuickPaymentCheck`: aceptar prop opcional `phaseId?: string`. Cuando se envía, guardar `phase_id` en el insert de `order_item_supplier_payments` y en la RPC `confirm_supplier_advance_payment` (agregar parámetro opcional `_phase_id`).
- Migración: actualizar la firma de `confirm_supplier_advance_payment` para aceptar `_phase_id uuid default null` y guardarlo.

### 5. Trigger de auto-finalización del ítem

Nueva migración: trigger `AFTER UPDATE OF status ON order_item_phases` — si todas las fases del `order_item_id` quedan `terminado`, hacer `UPDATE order_items SET production_finished_at = now(), production_finished_by = auth.uid()` cuando aún esté null.

## Detalle técnico

- Regla de "costo efectivo" del ítem cuando `has_phases`:
  ```ts
  effectiveCost = sum(phases.map(p => p.negotiated_cost ?? p.manufacturing_cost ?? 0))
  ```
  Reemplaza a `getEffectiveCost(item)` solo en las vistas que ya conocen las fases.

- Persistencia del toggle sin fases aún: el trigger `sync_order_item_has_phases` solo reacciona a INSERT/DELETE en `order_item_phases`. Para permitir activar el modo antes de crear fases, el toggle escribe `has_phases = true` directo en `order_items` y crea la primera fase en la misma acción; al eliminar la última fase, el trigger lo baja a `false`.

- No se elimina información existente: los ítems con `has_phases = false` siguen usando exactamente la UI y flujos actuales (compatibilidad total).

## Archivos que se van a tocar

- `src/features/production/item-margins-section.tsx` — toggle + render condicional.
- `src/routes/_authenticated.erp.production.tracking.tsx` — cargar `has_phases`, render condicional por ítem.
- `src/features/production/item-phases-tracking.tsx` — **nuevo**.
- `src/features/production/supplier-advance-payment-form.tsx` — prop `phaseId?`.
- `src/features/production/supplier-advance-payment-card.tsx` — prop `phaseId?` (listar pagos por fase).
- `src/features/production/supplier-quick-payment-check.tsx` — prop `phaseId?`.
- Migración SQL:
  - `ALTER FUNCTION confirm_supplier_advance_payment` para aceptar `_phase_id`.
  - Nuevo trigger de auto-finish de ítem por fases completas.
