## Hito 2 — Clientes, Pedidos y Estados configurables

Objetivo: que cada marca pueda gestionar su cartera de **clientes** y registrar **pedidos** con items y un historial de **cambios de estado** auditado. Estados editables por marca (no hardcoded). Todo multi-marca con RLS y arquitectura lista para que el CRM enchufe después.

---

### 1. Modelo de datos (Supabase)

Cinco tablas nuevas en `public`, todas con `brand_id` para aislamiento multi-marca y RLS escrita sobre `user_brands` + `has_role`.

```text
customers
  id, brand_id (FK brands), display_name, doc_type, doc_number,
  email, phone, address, city, notes, is_active, created_by, timestamps
  UNIQUE (brand_id, doc_number) cuando doc_number no es null

order_statuses                ← estados configurables POR MARCA
  id, brand_id (FK brands), name, slug, color (token-friendly hex),
  sort_order, is_initial (bool), is_final (bool), is_active, timestamps
  UNIQUE (brand_id, slug)

orders
  id, brand_id, customer_id (FK customers),
  order_number (auto: GTO-2026-000123 por marca), 
  status_id (FK order_statuses), 
  notes, subtotal, discount, tax, total (numeric 14,2),
  assigned_to (uuid, nullable, FK auth.users vía user_id),
  created_by, timestamps
  UNIQUE (brand_id, order_number)

order_items
  id, order_id (FK orders ON DELETE CASCADE),
  description, quantity (numeric), unit_price, line_total, sort_order, timestamps

order_status_history          ← auditoría inmutable
  id, order_id, from_status_id (null en creación), to_status_id,
  changed_by (uuid), note, created_at
```

**Triggers / funciones**:
- `set_updated_at()` en todas las tablas con `updated_at`.
- `assign_order_number()` (BEFORE INSERT) → secuencia por marca tipo `GTO-2026-000001` usando prefijo de la marca (`brands.slug` en mayúsculas).
- `log_order_status_change()` (AFTER INSERT/UPDATE de `orders`) → inserta fila en `order_status_history` cuando `status_id` cambia (o en INSERT).
- `recalc_order_totals()` (AFTER INSERT/UPDATE/DELETE en `order_items`) → recalcula `subtotal` y `total` del pedido.
- Seed de estados por defecto al crear marca (no aplica retroactivo automático aquí; en la migración se siembran para las 4 marcas existentes: `Borrador`, `Confirmado`, `En producción`, `Entregado`, `Cancelado`).

**RLS** (mismo patrón que `brands`):
- SELECT: usuario tiene la marca en `user_brands` **o** es `admin`.
- INSERT/UPDATE/DELETE: `admin` **o** `ventas` con acceso a la marca (`comercial` queda preparado para el CRM, no se usa todavía).
- `order_status_history`: solo SELECT por usuarios con acceso; INSERT solo por triggers (no policy de insert para usuarios).

---

### 2. Server functions (`createServerFn`)

Toda lectura/escritura de datos pasa por server functions con `requireSupabaseAuth`. Nada de queries directas desde componentes para este módulo (sienta el patrón para el CRM).

**Crear** (cada uno con su `.functions.ts` en `src/features/<area>/server/`):

```text
src/features/customers/server/customers.functions.ts
  listCustomers({ brandId, search?, page?, pageSize? })
  getCustomer({ id })
  createCustomer({ brandId, ... })
  updateCustomer({ id, ... })
  toggleCustomerActive({ id, isActive })

src/features/orders/server/orders.functions.ts
  listOrders({ brandId, statusId?, customerId?, search?, page?, pageSize? })
  getOrder({ id })          ← incluye items + customer + status
  createOrder({ brandId, customerId, items[], notes?, statusId? })
  updateOrder({ id, ... })  ← cambiar notas/assigned_to
  changeOrderStatus({ id, toStatusId, note? })
  upsertOrderItems({ orderId, items[] })
  deleteOrder({ id })
  listOrderHistory({ orderId })

src/features/orders/server/order-statuses.functions.ts
  listStatuses({ brandId })
  createStatus({ brandId, name, color, isInitial?, isFinal? })
  updateStatus({ id, ... })
  reorderStatuses({ brandId, orderedIds[] })
  deleteStatus({ id })      ← bloquea si hay pedidos usándolo
```

Validación con Zod en `src/features/<area>/schemas/`.

---

### 3. UI / Rutas

Todas bajo el layout existente `_authenticated.erp.tsx` (sidebar + brand selector ya están).

```text
src/routes/_authenticated.erp.customers.tsx          ← listado + buscador + alta
src/routes/_authenticated.erp.customers.$id.tsx      ← detalle/edición
src/routes/_authenticated.erp.orders.tsx             ← listado con filtros (estado, cliente, búsqueda)
src/routes/_authenticated.erp.orders.new.tsx         ← creación con items dinámicos
src/routes/_authenticated.erp.orders.$id.tsx         ← detalle: items, totales, cambiar estado, timeline historial
src/routes/_authenticated.erp.settings.statuses.tsx  ← CRUD de estados de la marca activa (drag-reorder)
```

Sidebar actualizado: añadir entradas `Clientes`, `Pedidos`, `Configuración → Estados` (esta última solo admin).

Componentes nuevos clave:
- `CustomerForm`, `CustomerTable` (TanStack Table)
- `OrderForm` con `OrderItemsEditor` (filas dinámicas, totales en vivo)
- `OrderStatusBadge` (lee `color` del estado, con buen contraste)
- `OrderStatusChanger` (select + nota opcional → `changeOrderStatus`)
- `OrderHistoryTimeline`
- `StatusManager` (drag-and-drop con `@dnd-kit/sortable` — ya disponible en shadcn ecosystem; si no está, se instala)

Data fetching con `@tanstack/react-query` + `useServerFn` (patrón ya usado en el proyecto).

---

### 4. Arquitectura SOLID (continuando lo del Hito 1)

```text
src/features/
  customers/
    components/   (form, table, search)
    schemas/      (zod)
    server/       (*.functions.ts)
    hooks/        (use-customers, use-customer)
  orders/
    components/   (form, items-editor, status-changer, timeline, table)
    schemas/
    server/
    hooks/
```

- Hooks encapsulan `useServerFn + useQuery/useMutation` (un solo lugar para invalidaciones).
- Componentes presentacionales reciben datos por props (testeables sin Supabase).
- Estados configurables como dato, no como enum → cumple Open/Closed para nuevas marcas.

---

### 5. Lo que NO incluye este hito (queda para el siguiente)

- Kanban drag-and-drop entre estados (Hito 3).
- Asignación visual de responsables / notificaciones.
- KPIs y dashboard (Hito 4).
- PDF de pedido / facturación (Hito 6).
- Edición de items con histórico (por ahora `upsertOrderItems` reemplaza; el historial cubre solo cambios de estado).

---

### 6. Orden de ejecución propuesto

1. **Migración SQL** (tablas + triggers + RLS + seed de estados para las 4 marcas) — requiere tu aprobación.
2. Tras aprobar la migración: creo schemas Zod, server functions, hooks, componentes y rutas en paralelo.
3. Actualizo sidebar con las nuevas secciones.
4. Pruebo: crear cliente → crear pedido con items → cambiar estado → ver historial → editar estados de la marca.

¿Lo aplicamos así o ajustamos algo (nombres de estados por defecto, formato de numeración, campos extra en cliente/pedido)?
