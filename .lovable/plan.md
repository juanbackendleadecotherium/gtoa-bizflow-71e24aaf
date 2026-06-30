## 1. Bloquear productos ya enviados a producción

**Diálogo "Enviar a producción" (`src/features/production/send-to-production-button.tsx`)**

- Cambiar `getItemLock`: si `it.production_order_id` está definido, devolver `{ disabled: true, reason: "Ya en producción <CODE>" }`. Mantener el bloqueo actual por falta de planimetría.
- Eliminar el flujo de "Re-envío" (mensaje "la nueva orden la reemplaza" y mutación `regenerate` desde aquí pierden sentido a nivel del diálogo). Los productos en una orden existente solo se pueden reincorporar después de cancelar esa orden.

**Cancelación por el vendedor (`src/routes/_authenticated.erp.production.$id.tsx`)**

- Añadir botón **"Cancelar orden"** visible para el vendedor (rol `ventas`, también admin), pero **solo cuando `status === "pendiente"`** (antes de que producción la acepte). Si ya está en `en_proceso` o posterior, mostrar nota fija: *"Esta orden ya fue aceptada por producción. Para cancelarla, comunícate por WhatsApp con producción."*
- Al confirmar la cancelación (modal de razón reusando `ReasonDialog`):
  - Llamar nueva función `cancel_production_with_reason(p_id, p_reason)` (SECURITY DEFINER) que:
    - Verifica que la orden está en `pendiente`.
    - `UPDATE order_items SET production_order_id = NULL WHERE production_order_id = p_id` → libera los productos para que vuelvan a aparecer como "Nuevo".
    - Marca la orden como `cancelada` (nuevo valor en `PRODUCTION_STATUSES`) o la borra vía `production_deletions` con motivo. Preferencia: marcar `status='cancelada'` para conservar bitácora.
    - Registra evento en `production_audit_log` con `auth.uid()` / email.
- Agregar `cancelada` a `production-meta.ts` con color gris y excluirla de los listados activos del módulo de producción (revisar `_authenticated.erp.production.index.tsx` y `tracking.tsx`).

## 2. Hitos automáticos

Tabla `orders` ya tiene `invoice_date`, `planimetry_sent_date`, `client_promised_date`. `order_items` ya tiene `supplier_promised_date`. No requiere cambios de esquema, solo automatizaciones.

**Cuenta de cobro → `orders.invoice_date`**

- En `src/features/invoices/invoice-panel.tsx` (`issueMutation`), después del insert/update del `invoices`, hacer `supabase.from("orders").update({ invoice_date: <hoy ISO date> }).eq("id", order.id)` **solo si `invoice_date` aún es null** (no sobrescribir la fecha de la primera emisión cuando se regeneren versiones).

**Planimetría aceptada → `orders.planimetry_sent_date`**

- En la mutación `accept` de `_authenticated.erp.production.$id.tsx` (que cambia `status` a `en_proceso`), además actualizar `orders.planimetry_sent_date = today` para `p.order_id`, **solo si está null**.
- Alternativa más robusta: trigger en `production_orders` `AFTER UPDATE` que cuando `OLD.status='pendiente' AND NEW.status='en_proceso'` setea `planimetry_sent_date` en la orden vinculada si está vacío. Se hará como trigger para cubrir cualquier vía (incluida la regeneración futura).

**Entrega prometida al cliente → `order_items.supplier_promised_date` (−3 días hábiles)**

- Crear trigger en `orders` `AFTER UPDATE OF client_promised_date`: si cambia, calcular `client_promised_date − 3 business days` (usar función SQL equivalente a `subtractBusinessDays`, o un trigger en plpgsql con tabla de festivos como la del front; alternativa práctica: trigger que setea cada item solo si su `supplier_promised_date` está null, y delegar el cálculo a un helper en `src/lib/business-days.ts` invocado desde el handler que edita la fecha en `production.tracking.tsx`).
- Implementación elegida (más simple y consistente con el helper existente): en `_authenticated.erp.production.tracking.tsx`, cuando `onPatch({ client_promised_date })` se ejecute a nivel orden, después del update propagar el `supplier_promised_date = subtractBusinessDays(client_promised_date, 3)` a todos los `order_items` de esa orden cuyo `supplier_promised_date` esté null o difiera. Misma lógica al editar el campo a nivel de item individual queda intacta (override manual).

**Entrega real**

- Se deja editable manualmente por producción (sin automatización), tal como pediste.

## 3. Detalles técnicos

- Migración:
  1. Agregar `cancelada` como valor permitido (el campo `status` es texto libre hoy, basta con sumarlo a `PRODUCTION_STATUSES`).
  2. Crear `public.cancel_production_with_reason(p_id uuid, p_reason text) RETURNS void` SECURITY DEFINER, con verificación de pertenencia a la marca y status pendiente.
  3. Crear trigger `set_planimetry_sent_date_on_accept` sobre `production_orders`.
- Frontend:
  - `send-to-production-button.tsx`: lock por `production_order_id`, badge "Ya en producción", quitar selector de orden destino.
  - `production/$id.tsx`: botón Cancelar (pendiente), texto fijo cuando ya aceptada, llamada a la RPC.
  - `invoice-panel.tsx`: setear `invoice_date` en la primera emisión.
  - `production.tracking.tsx`: tras `onPatch` de `client_promised_date`, propagar `supplier_promised_date` a items.
  - `production-meta.ts`: agregar `cancelada`.
- Bitácora: todos los cambios pasan por triggers existentes (`log_production_changes`, `log_order_changes`) — no requiere trabajo adicional.

## 4. Fuera de alcance (confirmar si quieres incluir)

- Automatizar `client_actual_date` (lo dejaste explícitamente para después).
- Notificación push/email al vendedor cuando producción acepta (hoy ya se invalida la UI; se puede sumar luego).
