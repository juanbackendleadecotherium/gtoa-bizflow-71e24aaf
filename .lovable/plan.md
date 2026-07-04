## Objetivo

Añadir al módulo de Finanzas dos capacidades:

1. **Metas de ventas** editables por el administrador (por marca y por vendedor), con % de avance visible al vendedor en tiempo real.
2. **Comisiones por tramos** basadas en el cumplimiento mensual, con un flujo de solicitud → aprobación/rechazo por la gerente de ventas (Luisa) antes de que finanzas pague.

Empezamos con Montenegro / Claudia, pero la estructura sirve para todos los vendedores y marcas.

---

## 1. Metas de ventas (JD-08)

### Reglas confirmadas
- Meta **por marca** (ej. Montenegro = $250.000.000/mes) — obligatoria.
- Meta **por vendedor** (opcional, informativa) — el admin la puede ingresar/editar cuando quiera.
- Período: **mensual**.
- Base del cálculo de avance: suma de `order_financials.total` del mes vigente, filtrado por marca y por vendedor (`seller_id`/`created_by`).

### Cambios de datos
- `sales_goals` (nueva tabla): `brand_id`, `seller_id` (nullable → si `NULL` = meta global de la marca), `period_month` (date, día 1), `amount` (numeric). Único por (`brand_id`, `seller_id`, `period_month`).
- RLS: admin puede leer/escribir todo; vendedor solo puede leer las metas donde `seller_id = auth.uid()` o la meta global de una marca donde tenga acceso.

### UI
- **Nueva pestaña en Finanzas**: "Metas de ventas" (solo admin) — tabla por marca y por vendedor del mes seleccionado con edición inline.
- **En `/erp/finance/sellers`** (ranking): agregar barra de avance vs meta del vendedor y % contra la meta de marca.
- **Dashboard del vendedor** (`/erp` index o `my-tasks`): tarjeta "Meta del mes" con % de avance, vendido y faltante.

---

## 2. Comisiones (JD-09)

### Tramos confirmados (aplican a todos los vendedores, configurables)
| Ventas del mes (marca)      | % comisión |
| --------------------------- | ---------- |
| Hasta $80.000.000           | 2.0%       |
| $80.000.001 – $99.999.999   | 2.5%       |
| $100.000.000 – $149.999.999 | 3.0%       |
| ≥ $150.000.000              | 3.5%       |

- La comisión se calcula sobre el **total vendido en el mes por el vendedor en esa marca**.
- Una comisión es **solicitable** cuando la orden tiene `saldo_cobrado = true` (pago completo, `balance = 0`).
- Se genera **una solicitud por orden** al completar el cobro; el % aplicado es el del tramo alcanzado por el vendedor en ese mes hasta ese momento.

### Cambios de datos
- `commission_tiers` (nueva tabla, seed con la tabla de arriba): `min_amount`, `max_amount` (nullable = infinito), `percentage`, `is_active`.
- `commission_requests` (nueva tabla): `order_id`, `brand_id`, `seller_id`, `sale_amount`, `tier_percentage`, `commission_amount`, `status` (`pendiente|aprobada|rechazada|pagada`), `rejection_reason`, `approved_by`, `approved_at`, `paid_by`, `paid_at`.
- **Trigger**: cuando un pago hace que `balance` de una orden llegue a 0 → insertar `commission_request` (si no existe).
- RLS: vendedor lee las suyas; admin (Luisa) lee todas, aprueba/rechaza; finanzas marca como pagada.

### UI
- **Nueva pestaña Finanzas → "Comisiones"** (admin): lista de solicitudes pendientes con botones Aprobar / Rechazar (motivo obligatorio si rechaza), y pestañas Historial / Pagadas.
- **Tarea en "Mis tareas"** de Luisa: "Comisión pendiente de aprobación — Vendedor X, orden #Y, $Z".
- **Notificación al vendedor** al aprobar/rechazar (misma tabla `seller_tasks`).
- **Historial por vendedor** en `/erp/finance/sellers`: total comisiones aprobadas, pagadas y pendientes del mes.

---

## Preguntas antes de codificar

1. **¿La meta del vendedor es independiente de la meta de la marca o siempre debe ser una porción de ella?** (Ej. Claudia = meta propia de $250M igual a la marca, o meta menor tipo $180M).
2. **Los tramos de comisión, ¿son iguales para todas las marcas** o cada marca tendrá los suyos más adelante? (Puedo dejar la tabla lista para variar por marca aunque hoy usemos un único set).
3. **Al aprobar la comisión**, ¿marca directa a "pagada" o queda en "aprobada" y finanzas la pasa a "pagada" en un paso posterior? (Recomiendo dos pasos: Luisa aprueba, Finanzas paga).
4. **¿Existe reversa de comisión** si una orden pagada luego se reembolsa/anula? (Puedo dejar `status='revertida'` reservado).

Con las respuestas cierro la implementación en una sola tanda: migración + UI de metas + UI de comisiones + tareas/notificaciones.
