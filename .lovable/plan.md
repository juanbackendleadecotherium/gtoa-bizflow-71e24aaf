## Objetivo

Permitir al vendedor (rol `ventas` sin admin ni operativo) acceder a la vista de detalle de la orden de producción con permisos acotados.

## Cambios en `src/routes/_authenticated.erp.production.$id.tsx`

### 1. Panel de acciones (barra superior)
Para el vendedor puro (`isSellerOnly === true`):
- **Ocultar**: `Aceptar orden`, `Rechazar` (ambos casos — pendiente y no pendiente). Estas decisiones son de producción.
- **Mostrar solo si `status === "pendiente"`**:
  - `Cancelar orden` (ya existe la mutación `cancelOrder`, hoy visible para todos en pendiente — se mantiene).
  - `Eliminar` (hoy restringido a `isAdmin`; se amplía la condición a `isAdmin || isSellerOnly` cuando la orden está pendiente).
- Si la orden ya no está pendiente: no ve ni Cancelar ni Eliminar (queda solo el aviso existente de "comunícate con producción").
- `Guardar cambios` se mantiene (para persistir notas).

### 2. Sección "Detalles"
Para el vendedor:
- **Estado**: ya se muestra como Input deshabilitado ✓ (sin cambios).
- **Encargado**: cambiar a solo lectura visual — renderizar como `Input` deshabilitado con el valor actual (o "—" si vacío). Hoy ya está `disabled`, pero se ajusta el texto para que no parezca editable.
- **Entrega estimada**: mismo tratamiento — mostrar la fecha formateada en un `Input` deshabilitado en lugar de un input `type="date"`.
- **Notas internas**: sigue editable ✓ (única cosa que puede cambiar y guardar).

### 3. Sección "Productos y márgenes"
Ya está oculta para vendedor (`!isSellerOnly && ...`) ✓. Sin cambios.

### 4. Sección "Planimetrías"
Nueva regla de edición para vendedor:
- Puede **ver** siempre.
- Puede **editar / subir / borrar** solo cuando `status === "pendiente"`.
- Cuando la orden ya no está pendiente: `readOnly = true` y sin botón de regenerar.

Implementación:
- Definir `const sellerCanEditPlanimetry = isSellerOnly && p.status === "pendiente"`.
- `readOnly` del `PlanimetryUploader`:
  - Admin/producción: `sellerLocked` (falso para ellos).
  - Vendedor: `!sellerCanEditPlanimetry`.
- `canDelete`:
  - Admin: `true` (actual).
  - Vendedor: `sellerCanEditPlanimetry`.
- Botón "Regenerar con formato actualizado": ocultarlo para el vendedor (es una acción de producción); hoy se muestra si `!sellerLocked`, se agrega `&& !isSellerOnly`.

### 5. Aviso informativo
Ajustar el mensaje ámbar existente ("Esta orden ya fue aceptada por producción…") para que también aclare al vendedor que ya no puede modificar planimetrías cuando la orden salió de "pendiente".

## Fuera de alcance
- No se tocan mutaciones (`cancelOrder`, `remove` ya existen y sus RPC validan permisos en base de datos).
- No se tocan RLS ni policies — se asume que las policies actuales permiten al vendedor dueño de la venta ejecutar `delete_production_with_reason` y `cancel_production_with_reason`. Si al probar sale error de permisos, se abrirá plan aparte para ajustar la policy.
- No se cambia la lógica de `isSellerRestricted` en `seller-restrictions.ts`.

## Criterios de aceptación
- Vendedor entra a `/erp/production/:id` y ve: cabecera, detalles (estado/encargado/fecha en solo lectura, notas editables), planimetrías, bitácora.
- No ve "Productos y márgenes".
- No ve botones "Aceptar" ni "Rechazar".
- Ve "Cancelar orden" y "Eliminar" solo si el estado es `pendiente`.
- Puede subir/editar/eliminar planimetrías solo si el estado es `pendiente`; en cualquier otro estado quedan en solo lectura.
- Puede guardar cambios en Notas internas en cualquier estado.
