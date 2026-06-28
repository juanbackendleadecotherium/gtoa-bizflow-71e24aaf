# Agendamiento de logística por el vendedor

Conecta la disponibilidad operativa del rol `logistica` con la programación de la fecha de logística de una factura, sin coordinación por WhatsApp.

---

## 1. Default seguro para días sin registro

**Por defecto un día sin registro = NO disponible.** Razón: evita que el vendedor agende en días en que logística no operará (festivos no marcados, fines de semana, vacaciones del conductor). Logística debe marcar explícitamente los días hábiles disponibles. Para no obligar a marcar día por día, el panel de logística incluye un botón **"Abrir próximos N días"** (default 30) que inserta registros `disponible=true` en bloque saltando domingos y festivos colombianos (usa `isBusinessDay` de `src/lib/business-days.ts` ya existente).

## 2. Validación de las 3 condiciones (factura lista para agendar)

Centralizada en una función SQL `public.invoice_can_schedule_logistics(_order_id uuid) returns boolean` para no duplicar la lógica entre UI y server function:

- **Estado factura**: `orders.status_code IN ('terminado','pendiente_por_logistica')` — los `order_statuses` ya tienen ambos códigos.
- **Saldo cobrado**: `orders.balance = 0` (la columna `balance` ya existe y se usa en cartera/finanzas).
- **QA aprobado**: hoy **no existe** un estado/columna de QA en el sistema. La función deja el chequeo preparado: lee `orders.qa_passed_at` si la columna existe (`coalesce(qa_passed_at, now()) is not null`); como la columna no existe aún, la función simplemente la omite y queda documentado en comentario SQL. Cuando se construya QA en otra tanda, se agrega la columna y se actualiza la función — la UI no cambia.

El selector de fecha en el vendedor está **deshabilitado** mientras la función devuelva `false`, con un tooltip explicando qué falta (estado, saldo, o QA cuando exista).

## 3. UI

### Panel logística (`/erp/logistics/pickups`)
- Nueva pestaña **"Disponibilidad"**: calendario mensual donde logística marca/desmarca cada día (toggle), con nota opcional. Botón "Abrir próximos 30 días hábiles" para sembrar en bloque. Realtime.
- Pestaña **"Activas"** existente: se agrega columna/badge "Agendada para: dd/mm" cuando la factura del ítem tiene `scheduled_logistics_date`. Se agrupa visualmente por factura+fecha.

### Vendedor — detalle de factura (`/erp/orders/$id`)
- Tarjeta nueva **"Programar logística"** dentro del panel de factura. Muestra:
  - Estado de las 3 condiciones (✓/✗ con label).
  - Si todas se cumplen: botón "Agendar fecha de logística" → abre Popover con `Calendar` (shadcn) que sólo permite seleccionar días con `disponible=true` en `logistics_availability` (resto deshabilitado vía `disabled` prop). Realtime: si logística cambia disponibilidad mientras el popover está abierto, se refresca.
  - Si ya está agendada: muestra fecha + botón "Reagendar" / "Cancelar agendamiento" (mismo rol que pudo agendar).

---

## 4. Modelo de datos (una sola migración)

```sql
-- 1. Disponibilidad por día
create table public.logistics_availability (
  date date primary key,
  available boolean not null default true,
  note text,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.logistics_availability to authenticated;
grant all on public.logistics_availability to service_role;
alter table public.logistics_availability enable row level security;
-- SELECT: cualquier authenticated (vendedor necesita leer)
-- INSERT/UPDATE/DELETE: solo admin o logistica
create policy "read availability" on public.logistics_availability for select to authenticated using (true);
create policy "manage availability" on public.logistics_availability for all to authenticated
  using (has_role(auth.uid(),'admin') or has_role(auth.uid(),'logistica'))
  with check (has_role(auth.uid(),'admin') or has_role(auth.uid(),'logistica'));

-- 2. Agendamiento sobre la factura
alter table public.orders
  add column scheduled_logistics_date date,
  add column scheduled_logistics_by uuid references auth.users(id),
  add column scheduled_logistics_at timestamptz;
-- Política de UPDATE de estas columnas: se valida en la server function (vendedor dueño
-- o admin/logistica), no se abre una policy nueva genérica.

-- 3. Función centralizada de elegibilidad
create or replace function public.invoice_can_schedule_logistics(_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.orders o
    where o.id = _order_id
      and o.status_code in ('terminado','pendiente_por_logistica')
      and coalesce(o.balance,0) = 0
    -- TODO: AND o.qa_passed_at is not null  -- cuando se construya QA
  );
$$;

-- 4. Realtime
alter publication supabase_realtime add table public.logistics_availability;
```

## 5. Server functions (`src/lib/logistics-scheduling.functions.ts`)

Todas con `requireSupabaseAuth` y verificación de rol dentro del handler:

- `listAvailability({ from, to })` — lectura para todos.
- `setAvailability({ date, available, note? })` — solo `admin|logistica`.
- `seedAvailableBusinessDays({ days })` — solo `admin|logistica`; inserta días hábiles próximos.
- `scheduleInvoiceLogistics({ orderId, date })` — valida `invoice_can_schedule_logistics(orderId)` + valida que el `date` esté en `logistics_availability` con `available=true` + valida que el caller sea el vendedor de la orden o `admin|logistica`. Setea las 3 columnas en `orders`.
- `clearInvoiceLogisticsSchedule({ orderId })` — mismas reglas de autorización.

## 6. Archivos a crear / modificar

**Nuevos**
- Migración con todo lo de §4.
- `src/lib/logistics-scheduling.functions.ts`
- `src/features/logistics/availability-calendar.tsx` (panel de logística)
- `src/features/logistics/use-availability-realtime.ts`
- `src/features/orders/schedule-logistics-card.tsx` (tarjeta vendedor)

**Modificados**
- `src/routes/_authenticated.erp.logistics.pickups.tsx` — agregar pestaña "Disponibilidad" y mostrar `scheduled_logistics_date` en filas.
- `src/features/logistics/pickup-table.tsx` — badge "Agendada dd/mm" cuando aplique.
- `src/routes/_authenticated.erp.orders.$id.tsx` — montar `ScheduleLogisticsCard`.
- `src/lib/pickup-orders.functions.ts` — `listPickupOrders` devuelve también `scheduled_logistics_date` de la orden.

**No se toca**: lógica de creación de `pickup_orders` por ítem terminado (sigue igual); el agendamiento opera a nivel de factura y es información paralela visible para logística.

¿Apruebas para implementar?
