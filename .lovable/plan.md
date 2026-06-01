# Hito 3 — Módulo Financiero

Nuevo módulo `/erp/finance` para el Gerente Financiero con dashboard, gestión de cartera por cobrar y desempeño por vendedor.

## Alcance

### 1. Base de datos
- **Tabla `order_payments`** (abonos/pagos posteriores al inicial):
  - `id, order_id, brand_id, amount, paid_at, method, reference, proof_url, note, created_by, created_by_email, created_at`
  - RLS: `has_brand_access` para SELECT; `can_write_brand` para INSERT; UPDATE/DELETE solo admin.
  - Trigger de auditoría → `order_audit_log` (acción `payment_insert`).
- **Tabla `order_collection_followups`** (recordatorios de cobro):
  - `id, order_id, brand_id, next_contact_date, status (pendiente|contactado|promesa|cerrado), note, created_by, created_at, updated_at`
  - RLS igual que `order_payments`.
- **Vista `order_financials`** (computada, no materializada):
  - Columnas: `order_id, brand_id, total, advance_amount, payments_total, paid_total (= advance + payments), balance, payment_status (pagada|abono|sin_abono), days_since_sale, created_by, seller_label`
  - Simplifica todas las queries del módulo.
- GRANTs estándar (`authenticated`, `service_role`) y políticas RLS por marca.

### 2. Permisos (rol existente)
- Mantener `app_role` actual. El módulo es visible para **admin** y **ventas**, pero:
  - **Admin**: ve todas las marcas accesibles y todos los vendedores.
  - **Ventas**: ve solo las ventas donde `created_by = auth.uid()` (filtrado en server functions, no en RLS para no romper otros módulos).

### 3. Server functions (`src/lib/finance.functions.ts`)
- `getFinanceDashboard({ brandId, month })` → KPIs: ventas del mes, mes anterior, cartera total, # facturas pendientes, top 5 vendedores, serie mensual 12 meses.
- `getReceivables({ brandId, filters })` → lista paginada de ventas con saldo > 0 (filtros: estado de pago, antigüedad, vendedor, búsqueda).
- `exportReceivablesCSV({ brandId, filters })` → genera CSV server-side y retorna como blob.
- `getSellerPerformance({ brandId, from, to })` → ranking por vendedor: # ventas, total facturado, cobrado, pendiente.
- `registerPayment({ orderId, amount, method, reference, paidAt, note, proofBase64? })` → inserta en `order_payments`, sube comprobante a `order-attachments`.
- `upsertFollowup({ orderId, nextContactDate, status, note })` → recordatorio de cobro.
- Todas con `requireSupabaseAuth` y validación Zod.

### 4. UI (rutas nuevas bajo `_authenticated/erp/finance`)
- **`/erp/finance`** — Dashboard
  - Cards KPI (ventas del mes, cartera, # pendientes, ticket promedio).
  - Gráfico de barras (Recharts) últimos 12 meses.
  - Tabla mini top-5 vendedores.
- **`/erp/finance/receivables`** — Cartera por cobrar
  - Filtros: estado (sin abono / abono parcial), antigüedad (0-30 / 31-60 / 61-90 / 90+), vendedor, marca activa.
  - Tabla con cliente, factura, total, abonado, saldo, días, próximo contacto, vendedor.
  - Acciones por fila: **Registrar pago**, **Programar seguimiento**, **Ver venta**.
  - Botón **Exportar CSV**.
  - Vista responsive tipo card en móvil (mismo patrón que ventas).
- **`/erp/finance/sellers`** — Desempeño por vendedor
  - Selector de rango (mes actual / mes anterior / personalizado).
  - Tabla ordenable: vendedor, # ventas, total facturado, cobrado, pendiente, % cobro.

### 5. Componentes nuevos
- `src/features/finance/payment-dialog.tsx` — modal de registro de pago (monto con `MoneyInput`, método, referencia, fecha, comprobante con `ImageUploader`, nota).
- `src/features/finance/followup-dialog.tsx` — modal de recordatorio.
- `src/features/finance/receivables-table.tsx` + versión card móvil.
- `src/features/finance/kpi-card.tsx`, `monthly-chart.tsx`, `sellers-leaderboard.tsx`.

### 6. Integraciones con módulo existente
- En `OrderDetail` / `InvoicePanel`: mostrar abonos registrados (timeline) y botón "Registrar pago" reutilizando el mismo diálogo.
- Cuando se regenera factura, el `advance_snapshot` incluye `advance_amount + SUM(order_payments.amount)` para reflejar lo cobrado a la fecha.
- Sidebar ERP: nueva sección "Financiero" con sub-items Dashboard, Cartera, Vendedores (visible para admin y ventas, con filtrado).

### 7. Auditoría
- Cada pago insertado y cada cambio de seguimiento se registra en `order_audit_log` vía trigger, visible en el `AuditTimeline` existente del pedido.

## Detalles técnicos
- Vista SQL `order_financials` evita lógica duplicada de cálculo de saldo en cada query.
- CSV generado con `Papa.unparse` (instalar `papaparse`) — server-side para respetar RLS y filtros.
- Recharts ya disponible (`src/components/ui/chart.tsx`).
- Tokens semánticos existentes (`primary`, `muted`, etc.) — sin colores hardcodeados.
- Sin Edge Functions: todo en `createServerFn`.

## Archivos a crear
- `supabase/migrations/<ts>_finance_module.sql`
- `src/lib/finance.functions.ts`
- `src/routes/_authenticated.erp.finance.tsx` (layout)
- `src/routes/_authenticated.erp.finance.index.tsx`
- `src/routes/_authenticated.erp.finance.receivables.tsx`
- `src/routes/_authenticated.erp.finance.sellers.tsx`
- `src/features/finance/*` (componentes listados arriba)

## Archivos a modificar
- `src/routes/_authenticated.erp.tsx` — agregar entradas de menú "Financiero".
- `src/features/invoices/invoice-panel.tsx` — incluir abonos en cálculo de balance.
- `src/routes/_authenticated.erp.orders.$id.tsx` — sección "Pagos" con timeline + botón.

## Verificación
1. Registrar un abono adicional en una venta con saldo → saldo se reduce en cartera y en la venta.
2. Dashboard muestra total del mes que coincide con suma manual de ventas.
3. CSV exportado contiene exactamente las filas filtradas.
4. Como usuario rol `ventas`: solo ve sus propias ventas en cartera y ranking.
5. Auditoría del pedido muestra el pago registrado con usuario y monto.
