## Objetivo

Permitir marcar cualquier `order_item` como **Obsequio**. El ítem se cobra $0, no impacta el total de la venta ni el saldo pendiente, aparece etiquetado en la cuenta de cobro, y **sigue el flujo normal de producción**.

## 1. Base de datos (migración única)

Sobre `public.order_items`:

- Nueva columna `is_gift boolean NOT NULL DEFAULT false`.
- Nueva columna de auditoría: `gifted_by uuid`, `gifted_by_email text`, `gifted_at timestamptz`.
- Actualizar el trigger `set_line_total()` para que, si `NEW.is_gift = true`, force `line_total = 0` (independiente de `unit_price` × `quantity`). Se conserva `unit_price` original por trazabilidad — el precio "regalado" queda registrado.
- Actualizar `compute_order_item_margin()` / `order_items_recalc_margin()` para que un ítem con `is_gift = true` **no contamine el margen**: se marca `margin_pct = NULL` y el costo se sigue registrando como costo real. En los KPIs de margen (Analytics/comisiones) se excluye del numerador de ingresos, pero **el costo sí cuenta** — así el obsequio se refleja como una decisión que reduce margen global sin distorsionar el % por línea. (Confirmar con PM si prefiere excluirlo por completo; el default propuesto es "cuenta como costo, no como venta".)
- Nuevo trigger `BEFORE UPDATE OF is_gift`: si cambia `is_gift`, auto-llena `gifted_by = auth.uid()`, `gifted_by_email` desde `profiles`, `gifted_at = now()`; al desmarcar, limpia los tres campos.
- Registro en `order_audit_log` con acción `item_marked_as_gift` / `item_unmarked_as_gift`.
- `recalc_order_totals()` no requiere cambio: al sumar `line_total` (ya = 0 para obsequios) el `orders.subtotal/total` queda correcto automáticamente. El saldo pendiente (`total - pagos`) también, sin tocar código.

**RLS / permisos**: nueva policy `UPDATE` sobre `order_items` limitada a la columna `is_gift` para: (a) admins vía `has_role(auth.uid(),'admin')`, o (b) el vendedor dueño de la orden (`orders.seller_id = auth.uid()`). Se implementa con un trigger `BEFORE UPDATE` que rechaza el cambio de `is_gift` si el usuario no cumple ninguna de las dos condiciones (más simple que columna-level GRANTs y consistente con el resto del proyecto).

## 2. Tipos y capa de datos

Tras la migración, `src/integrations/supabase/types.ts` se regenera con los nuevos campos. Los SELECT existentes en `orders.$id.tsx`, `invoice-panel.tsx` y `invoice-document.tsx` se amplían para traer `is_gift` y `gifted_by_email/gifted_at`.

## 3. UI de la venta (`orders.$id.tsx` + `order-items-editor.tsx`)

- En cada fila del ítem: toggle **"Marcar como obsequio"** (icono 🎁, color verde). Visible solo si el usuario es admin o el vendedor de la orden; en caso contrario se muestra como badge readonly cuando ya está marcado.
- Al activar el toggle: dialog de confirmación ("Este ítem se cobrará $0 y no sumará al total. ¿Confirmar?"). Al confirmar → `update({ is_gift: true })`.
- Visual del ítem obsequio: `unit_price` tachado + badge naranja/verde **"Obsequio"** al lado del nombre; `line_total` mostrado como `$0`.
- Subtotal live (`liveSubtotal`) recalculado excluyendo obsequios: `qty * unit_price * (is_gift ? 0 : 1)`.
- Bloque "Auditoría del obsequio" (pequeño, colapsable): quién marcó y cuándo.

## 4. Cuenta de cobro / Factura

- `invoice-panel.tsx`: al construir `items` para la versión persistida, si `is_gift = true` → `unit_price` y `line_total` guardados como `0`, y se añade prefijo `"[OBSEQUIO] "` al `description` (o campo `is_gift` en el snapshot si preferimos mantener el precio original visible). **Decisión propuesta**: guardar el snapshot con `unit_price = 0` y descripción prefijada, para que versiones históricas de la factura sean fieles a lo cobrado.
- `invoice-document.tsx` (PDF): renderiza la fila con badge/label **"Obsequio"** al lado de la descripción; columnas de precio y subtotal muestran `$0`. Total de la factura queda igual al `orders.total` recalculado por el trigger.

## 5. Producción

Sin cambios de lógica. El flujo de planimetría, envío a producción y fabricación ignora `is_gift`. Solo se añade el badge **"Obsequio"** en las vistas de producción (`production.$id.tsx`, tabla de items) para que el proveedor/producción sepa que es un regalo y no espere pago.

## 6. Análisis / comisiones (KPI 3 margen)

- `analytics-operations.functions.ts` y `commissions.functions.ts`: al calcular ingresos por venta excluyen `line_total = 0` naturalmente. En la métrica de "margen bruto", el costo real de los items obsequiados se sigue restando → **el obsequio reduce margen del vendedor**, que es el comportamiento correcto para desincentivar abuso.
- Comisiones: los ítems obsequio no generan comisión (ingreso = 0).

## 7. Criterios de aceptación

- ✅ Toggle visible y funcional solo para admin y vendedor dueño.
- ✅ Ítem marcado como obsequio: `unit_price` original conservado, `line_total = 0`, subtotal/total/saldo de la orden recalculados sin él.
- ✅ Cuenta de cobro (PDF y UI): ítem visible con label "Obsequio" y precio $0; total no cambia.
- ✅ Producción: el ítem sigue el flujo normal (planimetría, envío, fabricación, entrega).
- ✅ Auditoría: `order_audit_log` registra quién marcó/desmarcó y cuándo.
- ✅ Una factura con todos los ítems obsequio queda con total = $0 (permitido).

## Riesgos y decisiones pendientes de confirmar

1. **KPI 3 / margen**: propuesto → el costo del obsequio cuenta como costo, el ingreso no. Alternativa: excluir el item por completo del cálculo. Confirmar con PM.
2. **Snapshot de factura**: propuesto → guardar `unit_price = 0` en la versión persistida para fidelidad histórica. Alternativa: preservar `unit_price` original y solo mostrar $0 vía flag `is_gift`.

Si no hay observaciones, se procede con los defaults propuestos.
