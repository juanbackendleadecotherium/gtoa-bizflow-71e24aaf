
## Objetivo

Permitir que Producción defina, para cada item de una venta, **una o más fases** (ej. "Construcción", "Pintado"), asigne un **proveedor distinto por fase**, y maneje **costo, anticipo y pago final independientes por fase**. Aplica a los dos módulos (Producción clásica y Producción Real). El avance por fase es libre (paralelo).

## 1. Modelo de datos (migración SQL)

### Nueva tabla `order_item_phases`
Una fila = una fase de producción de un item.

Campos de dominio:
- `order_item_id` (FK → `order_items.id`, cascada)
- `production_order_id` / `real_production_order_id` (nullables, para joins rápidos según módulo)
- `brand_id`, `order_id` (denormalizados, igual patrón que `order_item_supplier_payments`)
- `phase_index` (int, orden dentro del item: 1, 2, 3…)
- `name` (text, ej. "Construcción", "Pintado", "Tapizado")
- `supplier_id` (FK → `suppliers.id`, nullable hasta asignar)
- `manufacturing_cost` (numeric), `negotiated_cost` (numeric, nullable), `negotiated_at`, `negotiated_by`
- `quotation_date` (date, gatilla cola de pagos financieros)
- `supplier_promised_date`, `supplier_actual_date`
- `started_at`, `finished_at`, `finished_by`
- `status` (text: `pendiente` | `en_proceso` | `terminado`)
- `notes`
- Únicos: `(order_item_id, phase_index)`
- Timestamps y trigger `updated_at`

Con GRANTs (`authenticated` full, `service_role` all) y RLS espejando las policies de `order_items` (acceso por marca del usuario + admin).

### Cambios en tablas existentes
- `order_items`: los campos `supplier_id`, `manufacturing_cost`, `negotiated_cost`, `quotation_date`, `supplier_promised_date`, `supplier_actual_date`, `production_started_at`, `production_finished_at` **se mantienen** por compatibilidad y como "resumen" (agregado de fases). Se agrega:
  - `has_phases` boolean default false — se prende cuando el item tiene ≥1 fase creada.
- `order_item_supplier_payments`: agregar columna nullable `phase_id` (FK → `order_item_phases.id`). Cuando `has_phases = true`, todo pago (anticipo/final) debe referenciar una fase; cuando es false, sigue funcionando contra el item entero (retrocompatible).

### Funciones/RPCs
- Nueva RPC `start_item_phase(_phase_id uuid, _started_at timestamptz)` análoga a `start_real_production`: marca la fase `en_proceso`, sella `started_at`, y si TODAS las fases están iniciadas → sella `order_items.production_started_at`.
- Nueva RPC `finish_item_phase(_phase_id uuid, _finished_at timestamptz)`: marca fase `terminado`; si TODAS las fases están `terminado` → sella `order_items.production_finished_at` y dispara la lógica actual de item terminado.
- Actualizar (o duplicar como v2) `confirm_supplier_final_payment` para aceptar `_phase_id` opcional y validar contra el costo de la fase en lugar del item.
- Función helper `get_item_effective_cost(item_id uuid) returns numeric`: si `has_phases`, suma `coalesce(negotiated_cost, manufacturing_cost)` de las fases; si no, retorna la del item. Usada por márgenes y cola de finanzas.

### Migración de datos
Sin backfill: items existentes quedan con `has_phases = false` y siguen usando los campos actuales. Solo items nuevos (o los que Producción decida "convertir a fases") usarán la nueva tabla.

## 2. Cambios en Producción clásica (`production_orders`)

Archivo principal: `src/features/production/item-margins-section.tsx` (componente `ItemCard`).

- Agregar botón **"Dividir en fases"** en cada `ItemCard`. Al presionarlo:
  - Se despliega un editor de fases (lista con drag-order): `Nombre`, `Proveedor`, `Costo`, `Fecha cotización`, `Fechas prometidas`, `Notas`.
  - Botón "+ Agregar fase" y eliminar fase.
  - `has_phases` se pone en true al guardar la primera fase; el select de proveedor y el input de costo del item se ocultan/deshabilitan y se reemplazan por un resumen: "N fases · Costo total $X · Margen Y%".
- Cada fase muestra su propio bloque de:
  - `SupplierAdvancePaymentCard` / `SupplierAdvancePaymentForm` reutilizados, ahora aceptando prop `phaseId`.
  - Estado de fase (`pendiente` / `en_proceso` / `terminado`) con botones para avanzar (independientes entre fases — avance paralelo/libre).
- `effective-cost.ts`: actualizar para que, cuando `has_phases`, sume costos efectivos de fases.
- `margin-pill.tsx` / `item-margins-section.tsx` cálculo de margen: usar el costo agregado.

## 3. Cambios en Producción Real (`real_production_orders`)

Hoy el módulo maneja **un solo proveedor y costo a nivel de OP**. Para respetar el requisito "por item, con fases":

- En `src/routes/_authenticated.erp.real-production.$id.tsx`, reemplazar el bloque único de `supplier_id` + `supplier_cost` por una **tabla de items de la venta** (leyendo `order_items` del `order_id` asociado a la RPO). Cada fila del item incluye el mismo editor de fases descrito en la sección 2, reutilizando el componente.
- Los campos `real_production_orders.supplier_id` y `supplier_cost` se mantienen como snapshot histórico pero dejan de ser el input principal — se calculan desde el agregado de fases (proveedor "múltiple" si hay >1 distinto; costo = suma).
- El `stage` de la RPO sigue a nivel de orden (planimetría → proveedor → … → entregado). La transición a `aprobado` requiere que **todos los items tengan al menos una fase con proveedor asignado y costo** (validación en el botón).
- `MarginIndicator` (`src/features/real-production/margin-indicator.tsx`): usar la RPC/helper `get_item_effective_cost` agregado sobre todos los items.

## 4. Cola de finanzas y pagos a proveedores

Archivo: `src/lib/supplier-advance-payments.functions.ts`.

- `listPendingSupplierPayments`: cambiar la query para que cuando un item tenga `has_phases`, enumere **una fila por fase** que cumpla (proveedor asignado, quotation_date presente, costo > 0, sin anticipo). El item sin fases sigue apareciendo como una sola fila.
- `confirmSupplierAdvancePayment` / `confirmSupplierFinalPayment`: aceptar `phaseId?: string`. Al insertar en `order_item_supplier_payments`, guardar `phase_id`. Si `phaseId` está presente, llamar `start_item_phase` en vez de `start_real_production`.
- `getSupplierAdvancePaymentForItem` → nueva variante `getSupplierAdvancePaymentForPhase(phaseId)`.
- UI de finanzas (`_authenticated.erp.finance.supplier-payments.tsx`): mostrar nombre de fase junto al item cuando aplique ("Silla Barcelona · Fase: Pintado — Proveedor Pinturas SA").

## 5. UI y textos

- Nuevo componente `src/features/production/item-phases-editor.tsx` con la tabla editable de fases (usado por ambos módulos).
- Nuevo componente `src/features/production/phase-supplier-payment-block.tsx` que envuelve advance/final por fase.
- Badges de estado por fase (reusar estilo de `status-badge`).
- Actualizar `.lovable/plan.md` si aplica.

## 6. Verificación

- Crear venta con 2 items → mandar a producción → dividir un item en 2 fases con proveedores distintos → cada fase aparece como pago pendiente independiente en Finanzas → confirmar anticipo de fase 1 marca la fase `en_proceso` sin tocar la fase 2 → terminar ambas fases sella `production_finished_at` del item.
- El otro item (sin fases) sigue funcionando exactamente como hoy.
- Migración corre sin romper datos existentes.

## Detalles técnicos clave

- La tabla `order_item_phases` es la nueva fuente de verdad para el "por dónde va cada parte del producto". El item conserva sus campos agregados sólo por compatibilidad y como cache.
- `order_item_supplier_payments.phase_id` es nullable para no romper filas históricas.
- RLS: espejar policies de `order_items` (por marca + admin), sin `TO anon`.
- Todas las policies y GRANTs van en la misma migración que crea la tabla.
- Avance libre: no hay validación de secuencia entre fases; la única regla de agregación es "todas terminadas ⇒ item terminado".
