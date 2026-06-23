# Pago anticipado al proveedor — gate de inicio de producción

## 1. Modelo de datos

### `suppliers` (alter)
- `requires_advance_payment boolean NOT NULL DEFAULT false`
- `advance_payment_pct numeric(5,2) NOT NULL DEFAULT 50` (por si mañana otro proveedor exige otro %, sin código nuevo)
- Migración semilla: `UPDATE suppliers SET requires_advance_payment = true WHERE lower(name) = 'ebanistería'` (en todas las marcas).

### Nueva tabla `public.order_item_supplier_payments`
Un pago anticipado por `order_item`. Una sola fila viva por ítem; al confirmar queda inmutable (la UI bloquea, no se construye undo).

Campos de dominio:
- `order_item_id uuid NOT NULL UNIQUE REFERENCES order_items(id) ON DELETE CASCADE`
- `production_order_id uuid REFERENCES production_orders(id) ON DELETE SET NULL`
- `order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE`
- `brand_id uuid NOT NULL REFERENCES brands(id)`
- `supplier_id uuid NOT NULL REFERENCES suppliers(id)` — snapshot del proveedor al momento del pago
- `supplier_name_snapshot text NOT NULL`
- `amount numeric(14,2) NOT NULL CHECK (amount > 0)`
- `paid_at date NOT NULL`
- `receipt_path text NOT NULL` — ruta en bucket `supplier-payments` (privado), mismo patrón que planimetría
- `receipt_mime text`, `receipt_size_bytes int`
- `created_by uuid`, `created_by_email text`
- estándar `created_at` / `updated_at`

GRANTs: `SELECT, INSERT` a `authenticated` (no UPDATE/DELETE — atómico); `ALL` a `service_role`. RLS:
- `SELECT`: `has_brand_access(auth.uid(), brand_id)`
- `INSERT`: `can_write_brand(...)` + el ítem debe pertenecer a esa marca + proveedor debe tener `requires_advance_payment = true` (validado además dentro del server fn).
- No policies de UPDATE/DELETE → inmutable.

Storage: bucket nuevo **`supplier-payments`** (privado), policies análogas a `production-planimetries` (lectura/escritura sólo con acceso de marca; path = `{brand_id}/{order_id}/{order_item_id}/{uuid}.{ext}`).

## 2. Punto único de verdad: "fecha efectiva de inicio real"

Hoy `order_items.production_started_at` se setea con `now()` vía `start_real_production(p_item_id)`. Centralizo así:

- Reescribir **`public.start_real_production(p_item_id uuid, p_started_at timestamptz DEFAULT now())`** para que reciba opcionalmente la fecha efectiva.
- Nueva función SQL `public.effective_production_start_for_item(_item_id uuid) RETURNS timestamptz` (STABLE, SECURITY DEFINER) — única fuente de la verdad:
  - Si el supplier del ítem tiene `requires_advance_payment = true` → devuelve `paid_at` de `order_item_supplier_payments` (o `NULL` si no hay).
  - Si no requiere → devuelve `now()`.
- Toda la lógica de servidor (RPC `start_real_production`, server fn de confirmación de pago, cualquier futuro caller) consume esta función. **No se replica la regla en frontend ni en otro trigger.**
- El cálculo `production_due_date = estimated_delivery_date − 3 días hábiles` se mantiene tal cual está hoy (ya queda sellado al enviar a producción); no se mueve. Lo que cambia es **qué fecha cuenta como inicio real** para tracking, badges de desviación y el mensaje de notificación. Si el negocio confirma que `production_due_date` también debe recalcularse desde el pago, lo agregamos en el mismo server fn (un solo UPDATE) — ver pregunta abierta abajo.

## 3. Server functions (TanStack, `createServerFn` + `requireSupabaseAuth`)

Archivo nuevo `src/lib/supplier-advance-payments.functions.ts`:

- `confirmSupplierAdvancePayment({ orderItemId, amount, paidAt, receiptPath })`
  1. Carga ítem + supplier; valida `requires_advance_payment = true`, `can_write_brand`, que no exista pago previo, y que `receiptPath` empiece por la ruta del ítem (anti-spoof).
  2. INSERT en `order_item_supplier_payments` (snapshot del supplier_name).
  3. Llama internamente al RPC `start_real_production(p_item_id, paidAt::timestamptz)` → ese RPC ya inserta la `seller_task` `production_started` existente (mismo tipo, mismos destinatarios). Ajustamos el `reason` para que cuando venga de pago anticipado diga: *"Ítem X inició producción con {supplier_name}. Fecha estimada de entrega: {production_due_date | order.estimated_delivery_date}"*.
  4. Devuelve el registro.

- `getSupplierAdvancePaymentForItem({ orderItemId })` — lee pago + signed URL (60 min) del comprobante.

- `uploadSupplierPaymentReceipt` — sigue el mismo patrón que `src/lib/planimetry-upload.ts` (sube desde el cliente con la sesión del usuario al bucket privado; el server fn sólo valida la ruta al confirmar). No se inventa un endpoint nuevo de upload.

## 4. Frontend

Componentes nuevos en `src/features/production/`:

- `supplier-advance-payment-notice.tsx` — banner amarillo "Este proveedor requiere pago del 50% para iniciar producción" cuando `supplier.requires_advance_payment && !pago`.
- `supplier-advance-payment-form.tsx` — monto (MoneyInput), `paid_at` (date), uploader de comprobante (PDF/imagen, reusa pattern de `planimetry-uploader.tsx`), botón **"Confirmar pago / Inicio real de producción"** que llama `confirmSupplierAdvancePayment`. Mientras `isPending` deshabilita todo.
- `supplier-advance-payment-card.tsx` — vista de sólo lectura cuando ya hay pago: monto, fecha, link al comprobante (signed URL), badge "Inicio real registrado el …". Sin botón de deshacer.

Integración:

- **`src/routes/_authenticated.erp.production.tracking.tsx`** (`ExpandedPanel`, alrededor de la línea 652) — antes del botón "Inicio hoy":
  - Si `supplier.requires_advance_payment` y no hay pago → renderizar `SupplierAdvancePaymentNotice` + `SupplierAdvancePaymentForm`, y **ocultar el botón "🚀 Inicio hoy"** (el formulario lo reemplaza para esos ítems).
  - Si ya hay pago → `SupplierAdvancePaymentCard` + `production_started_at` ya sellado por el RPC.
  - Si supplier no requiere → comportamiento actual intacto.
- Pasar `requires_advance_payment` en el SELECT de suppliers que ya hace la página (línea ~143/suppliers) — agregar la columna.

Realtime: nuevo `useEffect` que se suscribe a `postgres_changes` en `public.order_item_supplier_payments` filtrado por `brand_id` y a `public.order_items` (ya cubierto). Sigue el patrón existente del módulo de tracking; invalida las queries `production-orders-drive` y `supplier-advance-payment`.

## 5. Cambio de proveedor con pago ya confirmado

Regla: **el pago queda atado al `order_item` y al `supplier_id` snapshot**, no migra.

- Trigger BEFORE UPDATE OF `supplier_id` en `order_items`: si existe pago para el ítem y `NEW.supplier_id IS DISTINCT FROM OLD.supplier_id` → `RAISE EXCEPTION 'No se puede cambiar el proveedor: este ítem ya tiene un pago anticipado confirmado a {snapshot}. Crea una nueva orden o gestiona el reembolso fuera del sistema.'`. Esto cubre el caso de error de captura y evita inconsistencias silenciosas. Si el negocio quiere un flujo de "anular pago", se discute aparte (fuera del alcance porque el usuario dijo "no construyas función para deshacer").

## 6. Archivos tocados

Nuevos:
- `supabase/migrations/<ts>_supplier_advance_payments.sql` — alter suppliers + tabla nueva + GRANTs + RLS + funciones `effective_production_start_for_item` y `start_real_production` v2 + trigger anti-cambio-de-proveedor + bucket `supplier-payments` (vía `storage_create_bucket` tool, en mensaje aparte) + storage policies + seed Ebanistería + `ALTER PUBLICATION supabase_realtime ADD TABLE public.order_item_supplier_payments`.
- `src/lib/supplier-advance-payments.functions.ts`
- `src/lib/supplier-payment-upload.ts` (helper análogo a `planimetry-upload.ts`)
- `src/features/production/supplier-advance-payment-notice.tsx`
- `src/features/production/supplier-advance-payment-form.tsx`
- `src/features/production/supplier-advance-payment-card.tsx`

Modificados:
- `src/routes/_authenticated.erp.production.tracking.tsx` — render condicional + subscripción realtime + select de suppliers incluye `requires_advance_payment`.
- `src/routes/_authenticated.erp.settings.suppliers.tsx` — toggle `requires_advance_payment` en el editor y badge en la lista (catálogo).
- `src/integrations/supabase/types.ts` se regenera tras la migración (no se edita).

## Pregunta abierta antes de codear

`production_due_date` (entrega cliente − 3 días hábiles) hoy se sella **al enviar a producción**, no depende del inicio. Para ítems con pago anticipado, ¿quieres que también se **recalcule en el momento del pago** usando la `estimated_delivery_date` vigente del pedido (por si la fecha de entrega cambió entre el envío a producción y el pago)? Si sí, lo hago dentro del mismo server fn de confirmación (un solo UPDATE) y el mensaje de notificación usa ese valor recién recalculado. Si no, dejo la fecha actual tal cual.
