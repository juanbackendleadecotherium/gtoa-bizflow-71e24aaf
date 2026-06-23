## Objetivo

Convertir la subida de planimetría en un paso obligatorio por producto antes de enviar a producción. La venta nace en **Pendiente de planimetría** y solo los productos con planimetría cargada pueden viajar a la OP; los que falten quedan como tarea pendiente para el vendedor con alerta visible.

## Cambios en la base de datos (una sola migración)

1. **Catálogo de estados** (`order_statuses`, por marca):
   - Renombrar `borrador` → `pendiente-planimetria` · nombre "Pendiente de planimetría" · color `#a855f7` (morado, distinto a Confirmado/En producción) · `is_initial=true`.
   - Desactivar `confirmado` (`is_active=false`). No se elimina para preservar historial de ventas que ya pasaron por ese estado.
2. **Nuevo campo en `order_items`**:
   - `planimetry_files jsonb NOT NULL DEFAULT '[]'::jsonb` → array de `{ url, name, mime, size, uploaded_at }`.
   - Índice GIN opcional para futuros filtros tipo "items sin planimetría".
3. **Helper SQL** `public.order_item_has_planimetry(order_item_id uuid) → boolean` (security definer) usado por la UI y por triggers.
4. **Guardrail server-side**: trigger `BEFORE UPDATE` en `order_items` que rechaza setear `production_order_id` si `planimetry_files` está vacío (evita bypass desde queries directas).
5. **Tarea automática**: trigger en `order_items` que, al enviar a producción parcialmente, crea/actualiza un `seller_tasks` tipo `upload_planimetry` por cada item de la venta que quedó sin planimetría (una tarea por item, con `order_item_id` ya soportado por la tabla). Se resuelve sola cuando el item recibe su primer archivo.

## Cambios en frontend

### Editor de productos (`src/features/orders/order-items-editor.tsx`)
Agregar bloque nuevo debajo de "Imágenes de referencia":
- **Planimetría del producto** · uploader múltiple aceptando `image/*` y `application/pdf`.
- Reutiliza `ImageUploader` extendido (o un componente nuevo `PlanimetryFilesUploader` si el uploader actual no acepta PDF) con preview:
  - imágenes → thumbnail directo
  - PDF → ícono + primera página renderizada con `pdfjs-dist` (ya usado en planimetry-document si aplica; si no, fallback a ícono + nombre).
- Archivos suben al bucket `order-attachments` bajo `orders/<order_id>/items/<item_id>/planimetry/`.
- Estado vacío con copy claro: "Sin planimetría · obligatoria para enviar a producción".

### Vista de la venta (`_authenticated.erp.orders.$id.tsx`)
- Banner persistente naranja cuando hay items sin planimetría: "Faltan N planimetrías para enviar todo a producción".
- Por cada item en la lista: chip verde "Planimetría OK" o chip ámbar "Falta planimetría".

### Botón Enviar a producción (`src/features/production/send-to-production-button.tsx`)
- En el diálogo de selección de items: deshabilitar checkbox de los items sin planimetría con tooltip "Sube la planimetría primero".
- Permitir confirmar con selección parcial (4 de 5 está bien).
- Tras enviar: refrescar tareas del vendedor (los items restantes ya tienen su `seller_task` por trigger).

### Mis tareas (`_authenticated.erp.my-tasks.tsx` + `seller-tasks-panel.tsx`)
- Manejar el nuevo `type='upload_planimetry'`: tarjeta con link directo a la venta, ícono dedicado, severity `warning`.
- Badge inline en la venta (similar a `OrderSellerTasksBadge`) listando los items sin planimetría.

### Form de creación de venta
- Mensaje informativo en el footer del wizard: "La venta se guardará como **Pendiente de planimetría**. Podrás subir las planimetrías después y enviar productos a producción a medida que estén listos."
- No bloquea guardar la venta sin planimetría (ese es el punto: poder vender en sitio).

## Detalles técnicos

- **Sin nuevos buckets** — reusamos `order-attachments` (público). El path por item facilita borrado por cascada manual.
- **Validación cliente**: max 10 MB por archivo, hasta 8 archivos por producto.
- **PDF preview**: si `pdfjs-dist` no está, agregar con `bun add pdfjs-dist` y renderizar la primera página a un canvas de 200×260.
- **Tipos**: regenerar `src/integrations/supabase/types.ts` no es manual — la migración lo dispara.
- **Compatibilidad hacia atrás**: items existentes quedan con `planimetry_files=[]`. Para ventas ya en producción no afecta nada (el guardrail solo aplica al setear `production_order_id` desde NULL).

## Out of scope (lo dejo para otra iteración si lo pides)

- Validación OCR / aprobación del contenido de la planimetría.
- Versión / historial de planimetrías por item (hoy solo lista plana).
- Notificación por WhatsApp al vendedor cuando hay planimetría pendiente.