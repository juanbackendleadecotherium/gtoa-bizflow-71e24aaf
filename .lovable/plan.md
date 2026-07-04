## 1. Auditoría e historial de comisiones

**Nueva tabla `commission_audit_log`** (append-only) para registrar cada cambio:
- `commission_request_id`, `action` (`created` | `approved` | `rejected` | `paid` | `reverted`), `actor_id`, `actor_label`, `reason` (motivo rechazo), `reference` (referencia pago), `metadata jsonb`, `created_at`.
- RLS: admin/finanzas leen todo; vendedor lee solo los de sus propias comisiones.

**Triggers/RPC actualizadas**:
- Al crear una `commission_request` (trigger existente) → insertar log `created`.
- `approve_commission` → log `approved` con `actor_id`.
- `reject_commission` → log `rejected` con `reason`.
- `pay_commission` → log `paid` con `reference`.

**UI en `CommissionCard`**: nuevo `<details>` "Historial" que muestra timeline (fecha, acción, quién, motivo/referencia). Server fn `getCommissionAudit(id)`.

## 2. Pago masivo de comisiones aprobadas

- Nueva RPC `pay_commissions_bulk(_ids uuid[], _reference text)` — recorre y marca cada una como pagada, escribe log.
- En la pestaña **Aprobadas**: checkbox por fila + checkbox "seleccionar todas" + barra sticky con "Pagar N comisiones ($total)" que abre el `PayDialog` con referencia común.
- Tras confirmar, invalidar queries y las filas quedan visibles en la pestaña **Pagadas** (histórico ya existente, sin cambios).

## 3. Sidebar: quitar "Comisiones"

Eliminar el ítem `Comisiones` (`/erp/finance/commissions`) del `NAV` en `_authenticated.erp.tsx`. El badge de pendientes se mueve al ítem **Finanzas** (suma comisiones + otros si aplica) para no perder la señal.

## 4. Tabs de Finanzas sin mini-scroll

En `_authenticated.erp.finance.tsx` la barra usa `overflow-x-auto` y siempre muestra scrollbar. Cambios:
- Quitar `overflow-x-auto` en desktop; usar `flex-wrap` para que los tabs bajen si no caben.
- Reducir padding horizontal (`px-3` en vez de `px-4`) e íconos `h-3.5` para que quepan todos en una fila estándar (~1200px).
- Mantener scroll horizontal solo en mobile con `md:flex-wrap md:overflow-visible`.

## 5. Rediseño "Rendimiento por vendedor"

Actualmente es una lista simple con barra vs. top vendedor. Nuevo diseño:

**Fila superior — KPIs del mes** (4 cards):
- Ventas totales del mes (marca)
- Meta del mes (de `sales_goals` global de marca) + % cumplido con barra
- Total recaudado / cartera pendiente
- Nº de vendedores activos

**Podio Top 3** (cards grandes con avatar/inicial, medalla, monto y % vs meta individual).

**Tabla de ranking completa** con columnas:
- Posición, Vendedor, Nº ventas, Total vendido, Meta individual, % Meta (barra), Recaudado, % Recaudo, Saldo, Comisión estimada del mes (según tramo vigente).

**Selector de mes** conservado; agregar filtro "Todas las marcas" (admin) / marca actual.

**Fuentes de datos**: `order_financials` (ya usado) + `sales_goals` (meta por vendedor/marca) + `commission_tiers` (para estimar comisión con `commission_tier_for`).

## 6. Notificaciones automáticas a Luisa y Finanzas

Extender los triggers/RPCs de comisiones para crear `seller_tasks` a **todos los usuarios con rol `admin` o `finanzas`** en cada transición:

- **Creación** (`pendiente`) → tarea `commission_approval` a admins (ya existe; añadir también a finanzas como informativa `commission_new`).
- **Aprobada** → tarea `commission_approved` para finanzas (para que la paguen) + notificación al vendedor.
- **Rechazada** → tarea `commission_rejected` al vendedor con motivo + informativa a finanzas.
- **Pagada** → tarea `commission_paid` al vendedor + cierre de la tarea `commission_approved` de finanzas.

Cada tarea enlaza a `/erp/finance/commissions?status=<estado>` (agregar `validateSearch` en la ruta para preseleccionar tab).

---

### Detalles técnicos

**Migración SQL** (1 sola):
- `CREATE TABLE public.commission_audit_log(...)` + GRANTs (`authenticated`, `service_role`) + RLS + policies.
- Alterar `maybe_create_commission_request`, `approve_commission`, `reject_commission`, `pay_commission` para insertar log y crear tareas a finanzas.
- `CREATE FUNCTION public.pay_commissions_bulk(_ids uuid[], _reference text)` — SECURITY DEFINER, chequea rol admin/finanzas, itera llamando lógica de `pay_commission`.

**Archivos afectados**:
- `supabase/migrations/<nuevo>.sql`
- `src/lib/commissions.functions.ts` — nuevas fns `getCommissionAudit`, `payCommissionsBulk`.
- `src/routes/_authenticated.erp.finance.commissions.tsx` — historial en card, selección múltiple + barra de pago masivo, `validateSearch` para tab inicial.
- `src/routes/_authenticated.erp.finance.sellers.tsx` — rediseño con KPIs, podio y tabla enriquecida.
- `src/routes/_authenticated.erp.finance.tsx` — tabs sin scroll.
- `src/routes/_authenticated.erp.tsx` — remover ítem Comisiones del NAV, mover badge a Finanzas.
