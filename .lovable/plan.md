# Tableros ejecutivos — /erp/analytics/operations

Nueva ruta de solo lectura con tres tarjetas KPI en la misma pantalla y una barra superior de filtros globales (marca, vendedor, rango de fechas) que aplica a los tres al mismo tiempo. Al hacer clic en una tarjeta se abre un panel/dialog con el detalle en tabla.

## Filtros globales (barra superior)

- **Marca**: selector poblado desde `brands` limitado a las marcas que el usuario ve (usa `BrandProvider`).
- **Vendedor**: selector poblado desde `profiles` (usuarios con `orders.seller_id` asociados).
- **Rango de fechas**: date range picker; por defecto últimos 30 días. Se aplica a `orders.sale_date` (KPIs 2 y 3) y a la fecha de entrega programada (KPI 4).
- Los filtros viven como search params en la URL (`?brand=&seller=&from=&to=`) usando `validateSearch` + `zodValidator` para que sean compartibles.

## KPI 2 — Cumplimiento de entregas al cliente

**Definiciones**
- Fecha prometida = `orders.estimated_delivery_date`.
- Fecha real entregada = fecha de entrega efectiva de la orden. Se toma el `MAX(pickup_orders.delivered_at)` de los pickups con `destination='cliente'` de esa orden. Si no hay pickup a cliente entregado, la orden no cuenta como entregada aún y se excluye del cálculo (queda pendiente).
- A tiempo = `delivered_at::date <= estimated_delivery_date`.

**Tarjeta**: % entregas a tiempo sobre entregadas en el rango. Verde ≥90%, ámbar 75–89%, rojo <75%. Muestra también `X de Y entregadas a tiempo`.

**Detalle (clic)**: tabla con Cliente, Nº factura (`invoices.invoice_number` o `orders.invoice_number`), Fecha prometida, Fecha entregada, Días diferencia (positivo=tarde en rojo, ≤0 verde). Ordenada por mayor retraso primero.

## KPI 3 — Margen de productos (mínimo 45%)

**Definición**
- Por línea (`order_items`): `venta = unit_price * quantity`, `costo = COALESCE(negotiated_cost, manufacturing_cost)`, `margen% = (venta - costo)/venta * 100`.
- Se consideran solo líneas con `costo IS NOT NULL AND costo > 0` (las demás se listan aparte como "sin costo registrado").
- Cumple si `margen% >= 45`.

**Tarjeta**: barra proporcional dividida en Cumplen (verde) vs No cumplen (rojo) con los dos porcentajes visibles y el conteo absoluto.

**Detalle (clic)**: tabla de los que NO cumplen — Producto (`description`), Factura, Precio venta, Costo, Margen % (rojo). Ordenada por peor margen primero. Segunda pestaña opcional "Sin costo registrado".

## KPI 4 — Recaudo semanal proyectado con acumulación

**Semana** = semana ISO (lunes–domingo).

**Por cada orden con saldo pendiente**:
- Saldo = `orders.total - orders.advance_amount - SUM(order_payments.amount)` a la fecha.
- Semana objetivo = semana ISO de `orders.estimated_delivery_date` (si no hay fecha, va a "Sin fecha").

**Recaudado en semana W** = `SUM(order_payments.amount)` cuyo `paid_at` cae en W (solo pagos posteriores al anticipo inicial; el anticipo ya está restado del saldo).

**Lógica de rezago (acumulación)** por cada semana W en orden cronológico:
```
proyectado_nuevo[W]   = suma de saldos de órdenes cuya semana objetivo == W
rezago_entrada[W]     = pendiente_salida[W-1]  (0 si es la primera)
proyectado_total[W]   = proyectado_nuevo[W] + rezago_entrada[W]
recaudado[W]          = pagos recibidos durante W (limitados a proyectado_total[W])
pendiente_salida[W]   = max(0, proyectado_total[W] - recaudado[W])
```

**Tarjeta**: monto proyectado_total de la semana actual, dividido visualmente en "Nuevo esta semana" vs "Rezago de semanas anteriores". Badge con el % de rezago sobre el total.

**Detalle (clic)**: tabla/gráfico de barras apiladas semana a semana con columnas: Semana, Proyectado nuevo, Rezago entrada, Proyectado total, Recaudado, Rezago salida. Cada fila expandible muestra las facturas que componen el proyectado nuevo y el rezago de esa semana (cliente, Nº factura, saldo, fecha prometida original).

## Arquitectura técnica

**Ruta**: `src/routes/_authenticated.erp.analytics.operations.tsx` (nueva). La ruta actual `_authenticated.erp.analytics.tsx` pasa a ser layout con `<Outlet />` y redirige `/erp/analytics` → `/erp/analytics/operations` como pestaña inicial.

**Server functions** (nuevo `src/lib/analytics-operations.functions.ts`, todas con `requireSupabaseAuth`):
- `getDeliveryCompliance({ brandId?, sellerId?, from, to })` → `{ onTime, total, rows: [...] }`
- `getMarginCompliance({ brandId?, sellerId?, from, to })` → `{ compliant, nonCompliant, noCost, rows: [...] }`
- `getWeeklyCollectionForecast({ brandId?, sellerId?, from, to })` → `{ weeks: [...], currentWeek: {...} }`

Cada función corre queries directas a `orders`, `order_items`, `order_payments`, `pickup_orders`, `invoices` con los filtros aplicados. Los cálculos de agregación y la lógica de rezago se hacen en JS dentro del handler para mantener las queries simples. Datos devueltos como DTOs planos.

**Componentes** en `src/features/analytics/operations/`:
- `filters-bar.tsx` — barra sticky con selectores de marca/vendedor/fechas ligados a search params.
- `delivery-kpi-card.tsx` + `delivery-detail-dialog.tsx`
- `margin-kpi-card.tsx` + `margin-detail-dialog.tsx`
- `collection-kpi-card.tsx` + `collection-detail-dialog.tsx` (con barras apiladas usando `recharts` ya presente en `chart.tsx`)

**Data loading**: loader del route usa `queryClient.ensureQueryData` para las tres server functions en paralelo; componentes leen con `useSuspenseQuery`. `loaderDeps` incluye los cuatro search params para que un cambio de filtro re-dispare las queries.

**Acceso**: solo lectura. Restringido por `requireSupabaseAuth` + verificación de que el usuario tiene rol `admin` o `gerencia` (si no existe el rol, se limita a `admin`). Confirmar con el usuario si otros roles deben ver esta pantalla.

**Enlace en el menú**: entrada "Gráficas ERP → Operación" en el sidebar del ERP apuntando a `/erp/analytics/operations`.

## Preguntas para confirmar antes de construir

1. **Entrega real (KPI 2)**: ¿tomamos `MAX(pickup_orders.delivered_at)` con `destination='cliente'` como la fecha real de entrega al cliente? ¿O prefieres un campo distinto (p.ej. una futura `orders.actual_delivery_date`)?
2. **Costo para margen (KPI 3)**: ¿usamos `negotiated_cost` cuando existe y si no `manufacturing_cost`? ¿Los productos sin costo registrado se muestran en una pestaña separada o se ignoran?
3. **Vendedor**: filtro por `orders.seller_id` — ¿correcto?
4. **Acceso**: ¿solo `admin`, o también algún rol de gerencia/finanzas?
