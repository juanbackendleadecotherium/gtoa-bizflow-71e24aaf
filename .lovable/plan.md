# Ajustes de producción: precio negociado + planimetría opcional

## Ajuste 1 — Mostrar siempre el precio negociado

Hoy varias vistas muestran únicamente `manufacturing_cost` (precio original del proveedor) e ignoran `negotiated_cost`. Se unifica todo con la regla: **efectivo = `negotiated_cost ?? manufacturing_cost`**.

### Cambios de código (sin migración)

1. **Helper compartido** `src/features/production/effective-cost.ts`
   - `getEffectiveCost(item)` → devuelve el costo vigente (negociado si existe, sino original).
   - `hasNegotiation(item)` → boolean para mostrar badge "Negociado".

2. **`src/routes/_authenticated.erp.production.tracking.tsx`**
   - Añadir `negotiated_cost` al `select` de `production_orders` y de `order_items` (líneas 128 y 158).
   - Reemplazar todas las referencias directas a `manufacturing_cost` por `getEffectiveCost(...)` en:
     - Cálculo agregado `itemsWithCost` / `aggCost` (líneas 383‑387).
     - Input y controles por ítem (líneas 662‑665, 727, 743) — el input editable sigue siendo el "costo original", pero el resumen y el `suggestedAmount/suggestedCost` deben usar el efectivo.
   - Junto al precio mostrado, si hubo negociación, añadir badge pequeño "Negociado" con tooltip que muestra el original tachado.

3. **`src/features/production/item-margins-section.tsx`**
   - Ya calcula margen con `negotiated_cost ?? manufacturing_cost`. Verificar que el "KPI Costo total" y el margen global también usen esta regla (ya lo hacen — solo revisar).

4. **PDF planimetría — `src/features/production/send-to-production-button.tsx` + `planimetry-document.tsx`**
   - Al armar `PlanimetryDocumentData`, pasar el precio efectivo. Si el PDF actualmente no muestra costo (sólo `unit_price` de venta), no se toca; si muestra costo del proveedor, cambiarlo por el efectivo. **A confirmar leyendo el documento actual antes de editar.**

5. **Analytics y pagos a proveedor** (`analytics-operations.functions.ts`, `supplier-advance-payments.functions.ts`) — ya usan la regla correcta. No se tocan.

## Ajuste 2 — Ítems estándar sin planimetría obligatoria

### Migración (una sola)

Añadir a `order_items`:
- `is_standard_product` `boolean not null default false`

Sin cambios en RLS ni funciones RPC.

### Cambios de código

1. **Schema/formulario de ítem** — `src/features/orders/schemas.ts` y `src/features/orders/order-items-editor.tsx`
   - Añadir campo `is_standard_product: z.boolean().default(false)` al `orderItemSchema`.
   - En el editor, agregar un checkbox pequeño debajo del título del ítem: **"Producto estándar — no requiere planimetría"**.
   - Persistirlo en el insert/update de `order_items` en `_authenticated.erp.orders.$id.tsx` (mutación que ya escribe items).

2. **Validación en envío a producción** — `src/features/production/send-to-production-button.tsx`
   - Añadir `is_standard_product` a los `select` de `order_items` (líneas 93 y 309).
   - En `itemSendState` (línea ~341‑347), si `it.is_standard_product === true`, no bloquear por "Sin planimetría". Mantener el resto de bloqueos (ya vinculado, etc.).
   - Ajustar el texto informativo del ítem para mostrar "Estándar — sin planimetría" en vez del contador de planimetrías.

3. **Etiqueta visual en seguimiento** — `src/routes/_authenticated.erp.production.tracking.tsx`
   - Añadir `is_standard_product` al select de items (línea 158).
   - Junto al título de cada ítem, mostrar un badge **"Estándar"** (variante neutra) cuando `is_standard_product === true`.

4. **PDF planimetría** — `planimetry-document.tsx` / `send-to-production-button.tsx`
   - Filtrar los ítems estándar antes de generar la sección de planimetría, o mostrarlos con la nota "Producto estándar — sin planimetría requerida" en lugar del bloque de imágenes.

## Notas

- No se toca la lógica de negocio existente (envíos parciales, márgenes mínimos, negociación obligatoria bajo el mínimo). Sólo se unifica qué precio se **muestra/usa como base**, y se agrega una excepción intencional a la validación de planimetría.
- Los cálculos de comisión y órdenes ya no se ven afectados: seguían usando el precio de venta (`unit_price` / `line_total`), no el costo del proveedor.
- Cambios contenidos, sin refactors amplios; migración mínima (una columna).
