# Rediseño de "Mis tareas" + estabilidad de notificaciones

## Problema
1. Hoy `Mis tareas` mezcla dos cosas muy distintas: **tareas accionables** (hacer algo para que se resuelva) y **avisos informativos** (enterarse y listo). El nombre y la UI no lo reflejan.
2. Hay huecos en el flujo de avisos. El más claro: cuando producción **rechaza** una planimetría y el vendedor la **corrige y reenvía**, producción **no recibe una nueva tarea de revisión**. La OP pasa de `rechazada → pendiente`, pero el trigger que crea la tarea `production_review_op` sólo se dispara en `INSERT`, no en `UPDATE`.

## Parte 1 — Renombrar y separar el módulo

Renombrar la ruta de menú a **"Bandeja"** con dos pestañas de primer nivel:

- **Tareas** (acciones pendientes que TÚ debes hacer): `upload_planimetry`, `fix_planimetry`, `partial_shipment`, `invoice_ready_for_collection`, `pay_supplier_advance`, `confirm_supplier_final_payment`, `approval_pending` (admin), `commission_approval`, `commission_ready_to_pay`, `production_review_op`.
  - Cada tarjeta muestra: qué hay que hacer, CTA principal ("Subir planimetría", "Pagar", "Revisar"…) y se **auto-resuelve** cuando se cumple la acción (ya existe la lógica por trigger para la mayoría; se documenta en el título de cada tarjeta).
  - Contador rojo en el sidebar = sólo estas.

- **Notificaciones** (enterarse, estilo Facebook): `production_started`, `production_accepted`, `approval_granted`, `supplier_advance_paid`, `partial_shipment_forms_done`, `invoice_collection_forms_done`, `commission_new/approved/paid/rejected/rejected_notice`.
  - Lista compacta, con "punto azul" si no leída, botón **"Visto"** para archivar (equivalente al `markSeen` actual).
  - Acción secundaria "Marcar todas como leídas".
  - Badge separado en sidebar (más discreto, gris).

Clasificación se hace en el frontend por `type` (mapa `TASK_TYPES` / `NOTIFICATION_TYPES`). No requiere cambios de esquema para la separación visual.

## Parte 2 — Estabilidad del flujo de notificaciones

### 2.1 Corrección de planimetría rechazada (bug confirmado)
`create_production_review_op_tasks` sólo dispara en `AFTER INSERT`. Cuando el vendedor reenvía tras rechazo, `seller-tasks-panel.tsx` hace `UPDATE production_orders SET status='pendiente'` y no se crea tarea para producción.

**Fix (migración):** convertir el trigger a `AFTER INSERT OR UPDATE` y disparar la creación de tarea cuando `NEW.status = 'pendiente'` y `(TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'pendiente')`. El `NOT EXISTS` existente ya evita duplicados. Añadir en el título / motivo el matiz "corrección tras rechazo" cuando `OLD.status = 'rechazada'`.

### 2.2 Auditoría rápida de otros flujos
Antes de cerrar, verificar y (si falta) corregir en la misma migración:
- **Aprobación gerencial**: cuando `orders.approval_status` pasa a `aprobada`/`rechazada`, ¿se resuelve la tarea `approval_pending` del admin y se crea `approval_granted` para el vendedor? Revisar trigger existente.
- **Pago de anticipo a proveedor**: al marcar pagado, ¿se resuelve `pay_supplier_advance` y se crea `supplier_advance_paid` al vendedor?
- **Cuenta de cobro / entrega parcial**: al marcar `forms_done`, ¿se crea la contra-tarea a producción/finanzas?
- **Comisiones**: transiciones `pendiente → aprobada → pagada` / `rechazada` deben generar y resolver los pares correspondientes.

Cada hueco encontrado se corrige en la misma migración; los ya funcionales quedan documentados sin cambios.

## Detalles técnicos

**Archivos a tocar:**
- `src/routes/_authenticated.erp.my-tasks.tsx` → renombrar título, dividir por dos pestañas superiores (Tareas / Notificaciones) que envuelven las actuales sub-pestañas Pendientes/Resueltas. Extraer clasificación `type → 'task' | 'notification'` a un helper.
- Nuevo `src/features/seller-tasks/task-classifier.ts` con los sets `ACTIONABLE_TYPES` y `NOTIFICATION_TYPES`.
- Sidebar (`src/routes/_authenticated.tsx` o el layout que muestre el badge) → dos contadores, uno rojo (tareas) y otro gris (notificaciones no leídas). Actualizar `useMyPendingTasksCount` para devolver `{ tasks, notifications }`.
- Migración SQL:
  - Recrear `create_production_review_op_tasks` con `AFTER INSERT OR UPDATE` y guardia por `OLD.status IS DISTINCT FROM 'pendiente'`.
  - Cualquier otro trigger detectado con hueco en la auditoría.
- No se requieren cambios en `seller_tasks` (schema).

**Compatibilidad:** la clasificación es puramente visual; las tareas existentes siguen apareciendo, sólo se reagrupan.

**Fuera de alcance:** cambios en cómo se crean tareas nuevas (más allá del bug identificado) y push notifications reales.
