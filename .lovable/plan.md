
## Objetivo

Ajustar el flujo de **Plan Separe** para que:
1. Al crear la venta se exija **mínimo 30%** de abono (hoy no exige nada específico para Separe; en la práctica producción se habilita al 50%).
2. Ese **30% habilite enviar a producción** (hoy exige 50% vía `separe_completed_at`).
3. La responsabilidad del 20% restante hasta el 50% queda del vendedor, pero **ya no bloquea producción**.
4. Los demás flujos (Venta normal, Pago Paulatino, Entrega Inmediata) quedan iguales.

## Cambios

### 1. Base de datos (migración)
- `check_separe_completion(p_order_id)`: cambiar el umbral `v_total * 0.5` → `v_total * 0.3`. Ajustar el texto del `seller_tasks` insertado ("completó el 30% del anticipo — habilitado para producción").
- Aplicar la función a las ventas Plan Separe **existentes** que ya cumplen el 30% pero aún no tienen `separe_completed_at`, para que puedan enviarse a producción sin recargar pagos.
- Nota: `invoice_can_schedule_logistics` (habilitación de logística/entrega) **no se toca**: la entrega sigue requiriendo saldo total pagado, como hoy.

### 2. Frontend — creación de la venta (`src/features/customers/new-customer-dialog.tsx`)
- Añadir validación específica para Plan Separe: si `advance_amount < total * 0.30`, bloquear guardado con mensaje "Plan Separe requiere un abono mínimo del 30% del total ({monto})".
- Mostrar en el resumen del Plan Separe el objetivo del 30% (progreso, faltante) en lugar/además del 50%.
- El botón "Crear venta" se deshabilita hasta cumplir el 30% cuando el tipo es Plan Separe.

### 3. Frontend — tarjetas y badges
- `src/features/orders/sale-flow-card.tsx`: la barra de progreso de Plan Separe pasa a medir contra el **30%**; el texto cambia a "Progreso hacia el 30% para habilitar producción". Al completar, mensaje: "30% alcanzado. Ya puedes enviar a producción. Falta cobrar el 20% restante hasta el 50% del total."
- `src/features/orders/sale-type-badge.tsx` → `canSendToProduction`: para `plan_separe` sin `separe_completed_at`, el mensaje de bloqueo pasa a "Plan Separe: falta completar el 30% del anticipo (actual X%)."
- `src/features/production/send-to-production-button.tsx`: sin cambios de lógica (ya se basa en `separeCompletedAt`, que ahora se activará al 30%).

### 4. Sin cambios
- Botón "Enviar a producción" (misma bandera `separe_completed_at`).
- Entrega/logística (sigue exigiendo saldo cero).
- Otros tipos de venta.
- Ventas Plan Separe históricas que ya tienen `separe_completed_at` (siguen válidas).

## Detalles técnicos

- Umbral parametrizable en frontend con una constante `PLAN_SEPARE_MIN_PCT = 0.30` en un módulo compartido (por ejemplo agregarla en `src/features/orders/sale-type-badge.tsx` y reutilizarla en `sale-flow-card.tsx` y `new-customer-dialog.tsx`) para evitar strings mágicos.
- La función SQL queda con el 30% hard-coded (consistente con el patrón actual del proyecto).
- Backfill: `SELECT check_separe_completion(id) FROM orders WHERE sale_type='plan_separe' AND separe_completed_at IS NULL;` dentro de la misma migración, después de actualizar la función.
