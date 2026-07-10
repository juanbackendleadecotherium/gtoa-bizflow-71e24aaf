## Problemas detectados

### 1. Colisión de `queryKey` que "desmarca" la fase aprobada (bug UI)

Dos `useQuery` distintos comparten la misma clave `["item-phases", <itemId>]` pero seleccionan **columnas distintas**:

- `src/features/production/item-phases-editor.tsx` (línea 66) → `select("*")` — incluye `ready_for_advance_payment`.
- `src/features/production/item-margins-section.tsx` (línea 452) → `select("id, manufacturing_cost, negotiated_cost, supplier_id, quotation_date")` — **NO** incluye `ready_for_advance_payment`.

Cuando el usuario marca la casilla, el mutation invalida `["item-phases", itemId]`. Ambos observers refetchean con su propio `queryFn`; el último en resolver sobreescribe la caché. Si gana el de `item-margins-section`, `phase.ready_for_advance_payment` queda `undefined` → `isReady=false` → check se ve desmarcado. Cambiar de pestaña dispara re-renders o re-observadores y termina de "ganar" la versión sin el campo.

**Verificado en DB**: ambas fases (`Piedra Sinterizada` y `Base de comedor`) tienen `ready_for_advance_payment=true` correctamente guardado. El problema es puramente frontend.

**Fix**: usar clave distinta para el query de margins (`["item-phases-cost", itemId]`) para que no colisione con la del editor.

### 2. Los pagos por fase no aparecen en la bandeja de Finanzas

`src/lib/supplier-advance-payments.functions.ts` → `listPendingSupplierPayments` solo consulta `order_items` con `ready_for_advance_payment=true`. Nunca lee `order_item_phases`, así que las fases aprobadas nunca aparecen en `/erp/finance/supplier-payments`.

Además, cuando el ítem padre tiene `has_phases=true`, no debería aparecer a nivel ítem (aunque igual estaría en `false`). Cada fase debe aparecer como su propia fila.

**Fix del backend (`listPendingSupplierPayments`)**:
- Consultar `order_item_phases` con `ready_for_advance_payment=true`, `supplier_id NOT NULL`, `quotation_date NOT NULL`, costo > 0, y sin un `order_item_supplier_payments` de tipo `advance` para ese `phase_id`.
- Devolver una fila por fase, con `phase_id`, `phase_name`, y `product` como `"<producto> · <fase>"` para que el usuario distinga.
- Añadir `phase_id: string | null` al tipo `PendingSupplierPayment`.

**Fix del frontend Finance page (`_authenticated.erp.finance.supplier-payments.tsx`)**:
- Mostrar el nombre de la fase cuando `phase_id` existe (badge o sufijo en la columna Producto).
- Pasar `phaseId` al diálogo de pago.

**Fix del formulario de pago (`supplier-advance-payment-form.tsx` + `confirmSupplierAdvancePayment`)**:
- Aceptar `phaseId` opcional en el input Zod.
- En el handler:
  - Si viene `phaseId`, cargar la fase (`order_item_phases`) en vez del ítem, tomar `supplier_id`, `brand_id`, `order_id`, `production_order_id`, `negotiated_cost/manufacturing_cost` de ahí.
  - Validar que no exista un `order_item_supplier_payments` con ese `phase_id` y `payment_type='advance'`.
  - Insertar con `phase_id` seteado.
  - La notificación al operativo (`notify_operativo_supplier_paid`) se llama con el `item_id` como hoy (contexto del producto padre).

## Cambios de código

1. **`src/features/production/item-margins-section.tsx`**
   - Cambiar `queryKey: ["item-phases", item.id]` → `["item-phases-cost", item.id]` (línea 452) e invalidar `["item-phases-cost", productionOrderId]` donde corresponda.

2. **`src/lib/supplier-advance-payments.functions.ts`**
   - Extender `PendingSupplierPayment` con `phase_id: string | null` y `phase_name: string | null`.
   - En `listPendingSupplierPayments`, hacer dos consultas (ítems y fases) y concatenar. Filtrar del ítem-level los que tienen `has_phases=true` (para no duplicar).
   - Extender `ConfirmInput` con `phaseId: z.string().uuid().optional().nullable()`.
   - En `confirmSupplierAdvancePayment.handler`, ramificar según `phaseId`.

3. **`src/features/production/supplier-advance-payment-form.tsx`**
   - Aceptar prop `phaseId?: string | null` y reenviarlo en `confirmFn`.

4. **`src/routes/_authenticated.erp.finance.supplier-payments.tsx`**
   - Mostrar `phase_name` en la columna Producto cuando exista.
   - Pasar `phaseId={active.phase_id}` al `SupplierAdvancePaymentForm`.

Sin cambios de DB (los triggers y `create_supplier_phase_payment_tasks` ya funcionan; solo faltaba exponer las fases en la bandeja).