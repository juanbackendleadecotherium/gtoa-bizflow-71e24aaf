# Restricciones al vendedor una vez que la OP está en producción

## Regla de negocio

Un ítem se considera "en producción" cuando su OP existe y su estado ∈ `["en_proceso","control_calidad","listo","entregado"]` (la constante `ACCEPTED_STATUSES` ya definida en `production/tracking.tsx`). A partir de ese momento el rol **vendedor puro** (`roles.includes("ventas")` y no admin ni operativo) pierde capacidad de editar/borrar planimetría y deja de ver datos internos de producción de ese ítem. Los demás roles no cambian. La restricción se evalúa por ítem, no por venta.

## Cambios

### 1. Helper compartido

Crear `src/features/production/seller-restrictions.ts`:

- `LOCKED_PRODUCTION_STATUSES = ["en_proceso","control_calidad","listo","entregado"] as const`
- `isProductionLocked(status?: string | null)` → `boolean`
- `useSellerRestricted()` → `{ isSellerRestricted: boolean }` que lee `useBrand()` y devuelve `true` sólo cuando el usuario tiene rol `ventas` y NO tiene `admin` ni `operativo`.

Así centralizamos el criterio y evitamos repetir la lógica de roles.

### 2. Detalle de venta — `src/routes/_authenticated.erp.orders.$id.tsx`

- Añadir al `select` de `items:order_items(...)` la relación `production_order:production_orders!production_order_id(status)`.
- Calcular `itemLocked = isSellerRestricted && isProductionLocked(it.production_order?.status)` por ítem.
- Pasar `locked={itemLocked}` a `OrderItemReadCard` y bloquear el botón "Editar venta" a nivel de ítems bloqueados: si el vendedor entra en modo edición, los ítems con OP en producción muestran su planimetría en modo solo lectura (sin uploader, sin borrar). Los demás ítems se editan normal.
- En `OrderItemReadCard` (mismo archivo), cuando `locked` es `true`, quitar cualquier acción de borrar planimetría — sólo se muestra la lista con enlaces de descarga.

### 3. Editor de ítems — `src/features/orders/order-items-editor.tsx`

- Aceptar por ítem un flag `planimetryReadOnly?: boolean` (derivado del padre).
- Cuando es `true`: reemplazar `PlanimetryFilesUploader` por una lista pasiva de archivos existentes (sólo descarga, sin "eliminar", sin drop zone, sin selector). No afecta `is_standard_product` ni otras columnas.

### 4. Detalle de OP — `src/routes/_authenticated.erp.production.$id.tsx`

Ya usa `isSellerOnly`. Reforzar para el caso "OP aprobada":

- Calcular `sellerLocked = isSellerOnly && isProductionLocked(p.status)`.
- Sección **Detalles**: cuando `sellerLocked`, ocultar los campos **Encargado** y **Entrega estimada** (son datos operativos internos del proveedor/planta). Mantener visible **Estado** y **Notas internas** (esta última ya es editable por vendedor y sirve para comunicación con el cliente).
- Sección **Planimetrías**: cuando `sellerLocked`, ocultar el botón "Regenerar" y renderizar `PlanimetryUploader` en modo solo lectura. Añadir prop `readOnly?: boolean` a `PlanimetryUploader` que desactiva subir/anotar/reemplazar/borrar y sólo muestra los archivos con opción de descarga.
- `ItemMarginsSection` ya está condicionada a `!isSellerOnly` → sin cambios.
- Bitácora: el bloque "Enviada por / Rechazada por" es útil para el vendedor; se mantiene.

### 5. Seguimiento de producción — `src/routes/_authenticated.erp.production.tracking.tsx`

Si el vendedor puro tiene acceso a esta ruta (hoy no está bloqueada), aplicar filtro visual sobre columnas sensibles cuando `isSellerRestricted`:

- Ocultar columnas y campos de: costo (`getEffectiveCost`, márgenes, `MoneyInput` de costo), cantidad de producción distinta a la vendida, proveedor asignado, pagos a proveedor, anticipos.
- Mantener visibles: código de OP, cliente, producto, estado / etapa, fechas de entrega, novedad.
- El `ExpandedPanel` para el vendedor sólo muestra estado de avance del ítem y planimetría en modo solo lectura.

### 6. Uploader de planimetría — `src/features/production/planimetry-uploader.tsx`

- Añadir prop opcional `readOnly?: boolean` (default `false`).
- Cuando `true`: no renderizar dropzone, botones de reemplazar/anotar/borrar; sólo lista con enlaces de descarga y versión.

## Notas

- Sin cambios en base de datos, RLS ni funciones RPC. Todo el control es de presentación; el backend ya restringe escrituras por RLS al vendedor donde corresponde. Si algún día hace falta, se puede endurecer con una policy adicional, pero no es parte de este cambio.
- La experiencia es "silenciosa": no se muestran mensajes de "no tienes permiso", simplemente desaparecen los controles y los campos internos.
- Admin y operativo mantienen la vista actual sin cambios.
