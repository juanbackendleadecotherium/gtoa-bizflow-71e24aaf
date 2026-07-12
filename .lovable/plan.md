## Objetivo

Agregar un cuarto tipo de venta **"Entrega inmediata"** para productos ya listos que no pasan por producción, pero que sí pasan por finanzas (KPIs, comisiones, cartera) y por logística de entrega. No se afecta el flujo actual de ventas normales, plan separe, pago paulatino, ni el módulo de producción.

---

## Reglas de negocio (resueltas con el usuario)

1. **sale_type nuevo e independiente:** `entrega_inmediata` (mutuamente exclusivo con `normal`, `plan_separe`, `pago_paulatino`).
2. **Requisito para entregar:** anticipo mínimo del **50%** (mismo umbral que hoy usa Plan Separe). Con menos del 50% no se puede agendar logística.
3. **No toca inventario / bodega:** solo se marca el avance de estado; no se generan `warehouse_movements`.
4. **NO pasa por producción** (`production_orders`, `real_production_orders`, planimetría, aprobación de producción). Sí pasa por **finanzas** (pagos, comisiones, KPIs del vendedor, cartera) y por **logística** (agendamiento y entrega).
5. **Estados propios** (por marca, `slug`s únicos para no chocar con producción):
   - `ei_pendiente_pago` — "Pendiente de pago" (inicial)
   - `ei_lista_entrega` — "Lista para entrega" (al alcanzar 50%)
   - `ei_en_ruta` — "En entrega / En ruta" (al agendar logística)
   - `ei_entregada` — "Entregada" (final, `is_final = true`)

---

## Cambios de base de datos (una sola migración)

### A. Estados nuevos por marca
Insertar en `order_statuses` los 4 estados anteriores para cada marca activa, con `sort_order` propio (por ejemplo 50, 51, 52, 53 para no colisionar con los de producción). Color distintivo (cyan/teal) para diferenciarlos visualmente en el listado.

### B. Trigger `tg_orders_entrega_inmediata_flow()`
`BEFORE INSERT OR UPDATE OF advance_amount, sale_type ON orders`:
- Solo actúa cuando `sale_type = 'entrega_inmediata'`.
- **INSERT:** fuerza `status_id` a `ei_pendiente_pago` de la marca (ignora aprobación gerencial, no aplica).
- **UPDATE de `advance_amount`:** si el pagado alcanza ≥ 50% del total y el estado actual sigue siendo `ei_pendiente_pago`, mueve a `ei_lista_entrega`.
- Nunca sobreescribe si el usuario ya lo movió manualmente a `ei_en_ruta` o `ei_entregada`.
- **No dispara** el trigger existente `tg_orders_auto_require_approval` (agregar guard `IF NEW.sale_type <> 'entrega_inmediata'` en esa función).

### C. Bloquear producción para este tipo
- En la RPC / función que crea `production_orders` desde una orden, rechazar con `RAISE EXCEPTION` si `orders.sale_type = 'entrega_inmediata'`.
- `canSendToProduction` (frontend) devuelve `{ ok: false, reason: "Venta de entrega inmediata: no requiere producción." }` para este tipo.

### D. Habilitar logística con 50%
En la función/lógica que valida el agendamiento (`schedule-logistics`), agregar la rama: si `sale_type = 'entrega_inmediata'` y `advance/total >= 0.5` (o `status_id = ei_lista_entrega`), permitir agendar. Al agendar, mover `status_id` a `ei_en_ruta`. Al completar entrega (pickup/driver marca entregado), mover a `ei_entregada`.

### E. Finanzas / KPIs / comisiones
Verificar que las vistas y funciones de finanzas (`commissions`, `sales-goals`, cartera, dashboards del vendedor) filtran por `orders.total` y `order_payments` sin excluir por `sale_type`. Si alguna vista actual excluye tipos, agregar `entrega_inmediata` a la lista permitida. **No** se crean tablas nuevas; las ventas siguen viviendo en `orders`.

---

## Cambios de frontend

### `src/features/customers/new-customer-dialog.tsx`
- Agregar `"entrega_inmediata"` al selector de `sale_type` con label "Entrega inmediata" y descripción corta ("Producto ya listo, no pasa por producción").
- Al elegirlo: deshabilitar el checkbox de "Solicitar aprobación gerencia" y ocultar el bloque de Plan Separe / Paulatino.
- El `status_id` inicial lo pone el trigger (D en migración anterior); el frontend no necesita resolverlo.

### `src/features/orders/draft-types.ts`
- Ampliar el union `sale_type` a `"normal" | "plan_separe" | "pago_paulatino" | "entrega_inmediata"`.

### `src/features/orders/sale-type-badge.tsx`
- Nueva rama en `SaleTypeBadge` para `entrega_inmediata` (badge cyan con icono `Truck` o `PackageCheck`).
- En `canSendToProduction`: devolver bloqueado con mensaje explícito.

### `src/features/orders/sale-flow-card.tsx`
- Nueva sección informativa cuando `sale_type = 'entrega_inmediata'`: barra de progreso hacia el 50% (idéntica a Plan Separe pero con copy "Progreso para habilitar entrega") y mensaje final "Lista para agendar entrega" cuando se alcanza.

### Detalle de orden (`_authenticated.erp.orders.$id.tsx`)
- Ocultar el botón "Enviar a producción" cuando `sale_type = 'entrega_inmediata'`.
- Mostrar en su lugar el botón "Agendar entrega" (reutilizar `ScheduleLogisticsCard`), habilitado solo cuando `status_id = ei_lista_entrega` o superior.

### Listados (Ventas, Mis tareas, Logística)
- Los estados nuevos aparecen automáticamente vía `order_statuses`. No requiere cambios adicionales.
- El listado de **producción** (`production/index`, `production/approvals`) ya filtra por `production_orders`, así que estas ventas quedan naturalmente excluidas. Verificar y, si algún filtro usa `orders.sale_type IN (...)`, añadir el nuevo tipo donde corresponda (o excluirlo si es filtro de producción).

---

## Validación posterior

1. Crear una venta con `sale_type = entrega_inmediata`, anticipo 30% → aparece como "Pendiente de pago", **no** aparece en producción, **no** pide aprobación gerencial.
2. Registrar un pago que la lleve a ≥ 50% → cambia automáticamente a "Lista para entrega".
3. Agendar logística → pasa a "En ruta". Marcar entregada desde logística → pasa a "Entregada" (final).
4. Verificar que en el dashboard financiero del vendedor la venta suma en total vendido, meta y comisión (KPIs).
5. Verificar que **no** aparece en `/erp/production/*` ni en `/erp/real-production/*`.
6. Verificar que crear una venta normal / separe / paulatino sigue funcionando idéntico a hoy.
