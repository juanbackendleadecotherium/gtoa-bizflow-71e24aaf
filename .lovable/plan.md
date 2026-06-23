## 1. Subir planimetría con pegar / arrastrar / elegir

Hoy `PlanimetryFilesUploader` solo abre el selector de archivos al hacer clic. Lo voy a igualar al uploader de imágenes de referencia (`ImageUploader`), que ya soporta clic, drag & drop y Ctrl/Cmd+V.

- Reutilizar la misma lógica: zona de drop con estado `isDragging`, listener `paste` global filtrado por foco/hover dentro del componente, y micro-feedback "Pegado" tras pegar.
- Aceptar tanto imágenes como PDF (las imágenes ya van por `compressImage` desde el padre al guardar; aquí solo agrego archivos al `pending`).
- Validar tamaño (10 MB) y tipo (`image/*` o `application/pdf`) como ya hace hoy.
- Textos: añadir una línea pequeña tipo "Puedes arrastrar o pegar con Ctrl/Cmd+V" igual que en la sección de Imágenes de referencia.

Sin cambios de esquema ni de backend para esta parte.

## 2. Cuenta regresiva de 2 días hábiles para la planimetría

### Regla de negocio
- Al crear la orden de producción (ya se genera una tarea `upload_planimetry` para el vendedor), calculamos un `planimetry_due_at` = creación + **2 días hábiles** (lunes–viernes, ignorando sábados y domingos).
- Estados visibles según el tiempo restante:
  - **A tiempo** (>1 día hábil restante): se ve igual que hoy.
  - **Por vencer** (<1 día hábil): badge ámbar "Vence pronto" en la alerta del vendedor.
  - **Vencida** (ya pasó el plazo): badge rojo "Vencida hace Xh" + escalamiento al gerente.

### Cambios de datos
- Añadir columna `planimetry_due_at timestamptz` a `seller_tasks` (solo se llena para `type = 'upload_planimetry'`).
- Función SQL `add_business_days(ts, n)` para calcular el plazo saltando fines de semana.
- Trigger `BEFORE INSERT` en `seller_tasks`: si `type = 'upload_planimetry'` y `planimetry_due_at` es null → asignar `add_business_days(now(), 2)`.
- Backfill para las tareas pendientes existentes.

### UI del vendedor (`OrderSellerPlanimetryAlert` / panel "Mis tareas")
- Mostrar el tiempo restante / vencido junto a cada producto pendiente de planimetría.
- Cuando esté vencida, cambiar la alerta de ámbar a roja con icono y mensaje "Lleva más de 2 días hábiles sin planimetría".

### Vista del gerente (admin)
- Nuevo panel `OverduePlanimetriesAdminAlert` que solo se renderiza si `has_role(auth.uid(),'admin')`.
- Lo coloco en el dashboard del ERP (`/erp` index) y como banner sticky en la cabecera del módulo de Ventas mientras haya pendientes vencidos.
- Lista agrupada por vendedor: nombre, # de planimetrías vencidas, antigüedad de la más vieja, link directo a cada venta.
- Query: `seller_tasks` con `type='upload_planimetry'`, `status='pendiente'`, `planimetry_due_at < now()`, join a `profiles` (vendedor) y `orders` (código/cliente).
- RLS: añadir policy de `SELECT` a `seller_tasks` para admin (hoy el vendedor solo ve las suyas).

### Notificación al gerente
- Toast/badge contador en el header del ERP (icono campana) con el número de planimetrías vencidas, visible solo para admin. Click → abre el panel.
- No envío email en esta iteración (lo dejo como sugerencia para luego, ya que requiere SMTP/edge function adicional). Si lo quieres, lo agrego después.

## Archivos a tocar (técnico)

- `src/features/orders/planimetry-files-uploader.tsx` — drag/drop + paste.
- Nueva migración SQL — columna `planimetry_due_at`, función `add_business_days`, trigger, backfill, policy admin SELECT en `seller_tasks`.
- `src/features/seller-tasks/seller-tasks-panel.tsx` — mostrar countdown/estado vencido en las tareas del vendedor.
- Nuevo `src/features/seller-tasks/overdue-planimetries-admin-alert.tsx`.
- Montar el panel admin en `src/routes/_authenticated.erp.tsx` (header) y en el dashboard si aplica.

## Pregunta abierta
- ¿"2 días hábiles" cuenta solo lunes–viernes (excluye sábado y domingo) y sin festivos? Asumo que sí salvo que me indiques festivos colombianos.
