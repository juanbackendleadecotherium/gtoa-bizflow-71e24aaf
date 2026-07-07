# Ventas en Borrador

Feature grande y transversal. Antes de escribir código quiero confirmar el alcance con vos.

## 1. Base de datos (migración)

- Insertar un `order_statuses` de sistema llamado **"Borrador"** (color gris), marcado como no-final y excluido de conteos activos. Añadir columna `is_draft boolean` en `order_statuses` (default false) y marcarlo `true` solo para este.
- En `orders`: nueva columna `last_draft_saved_at timestamptz` para el debounce y para calcular la alerta a 7 días.
- Trigger `BEFORE INSERT/UPDATE` que impida:
  - Vincular `invoices` a una orden con status borrador.
  - Crear `production_orders` desde una orden borrador.
- Función `has_active_draft(_user_id uuid)` para el dashboard.
- Cron diario (`pg_cron`) que marque en `seller_tasks` los borradores con `last_draft_saved_at < now() - 7 days` para que el vendedor los revise.
- **Todos los reportes/KPIs existentes** (finanzas, comisiones, metas, analytics) filtran por `status.is_draft = false`. Requiere revisar cada consulta — riesgo de regresión.

## 2. Auto-guardado en el formulario de venta

- El "formulario de nueva venta" hoy vive en `_authenticated.erp.orders.$id.tsx` (se crea la orden vacía primero y luego se edita). Para soportar borradores desde cero:
  1. Al hacer clic en **"Nueva venta"** crear inmediatamente una orden con `status = borrador`, redirigir a `/erp/orders/$id`.
  2. Cada campo modificado dispara un `setTimeout` de **30s** (o al blur de campos importantes: cliente, ítems, montos). Escribe con `.update()` sobre esa orden.
  3. Indicador visual "Guardado hace Xs" arriba del formulario.
- Al cambiar el status a "activa" (envío a producción / confirmación explícita), se sale del modo borrador. Botón visible: **"Confirmar venta"**.

## 3. Modal de confirmación al salir

- Hook `useBeforeUnload` + interceptor de navegación de TanStack Router (`router.subscribe('onBeforeNavigate')`).
- Solo si `status = borrador` y hay cambios sin guardar en el debounce pendiente.
- Modal: **"Guardar como borrador"** (flush inmediato + navegar) / **"Descartar"** (delete + navegar) / **"Cancelar"**.

## 4. Sección "Borradores" en dashboard

- En `_authenticated.erp.my-tasks.tsx` (dashboard del vendedor) nueva tarjeta "Borradores" que lista órdenes del vendedor con `status.is_draft = true`, ordenadas por `last_draft_saved_at desc`.
- Cada fila: cliente + total parcial + antigüedad + botones **Retomar** (navega) / **Eliminar** (confirmación).
- Badge rojo en los que llevan +7 días.

## 5. Bloqueos

- Botón "Enviar a producción" oculto/deshabilitado si `is_draft`.
- Panel de facturación oculto si `is_draft`.
- En la lista general `/erp/orders`: los borradores solo aparecen si el filtro incluye "Borrador" (no en la vista por defecto). Solo el vendedor dueño (y admin) los ve.

## Detalles técnicos

- Debounce implementado con `useRef<NodeJS.Timeout>` + flush en `beforeunload`.
- Escrituras van directo a `orders` y `order_items` con las políticas RLS existentes (el vendedor ya puede editar su orden).
- Cron con `pg_cron` + `net.http_post` a un server route en `/api/public/hooks/draft-alerts` (o directamente insertando en `seller_tasks` desde el propio SQL — más simple, sin round-trip).
- Filtro `is_draft = false` a agregar en (mínimo, hay que revisar todas):
  - `analytics-operations.functions.ts`
  - `commissions.functions.ts`
  - `sales-goals.functions.ts`
  - `invoices.functions.ts` (receivables)
  - Vistas de `_authenticated.erp.finance.*`

## Preguntas antes de implementar

1. **¿Debounce de 30s o al blur?** Propongo **ambos**: blur en campos clave (cliente, cada ítem, monto total) + timeout de 30s como red de seguridad. ¿OK?
2. **¿Crear orden en DB al abrir "Nueva venta"** (más simple, siempre hay ID), o mantener creación diferida en memoria hasta el primer save (evita órdenes vacías si el vendedor abre y cierra sin tocar nada)? Recomiendo la primera y limpiar borradores vacíos con el cron de 7 días.
3. **¿La alerta a 7 días** solo entra en `seller_tasks`, o también push/email? Asumo solo `seller_tasks` (que ya se muestra en el dashboard).
4. **¿Solo el vendedor dueño ve sus borradores**, o los admin/producción también los ven en la lista general? Recomiendo: dueño + admin; producción no.

Confirmá esas 4 y arranco con la migración + el auto-guardado. Es un cambio grande, prefiero acordar antes de tocar 8-10 archivos.
