
Voy a implementar los 3 requerimientos. Los dos primeros (JD-N04 aprobación gerencial y JD-N05 Plan Separe) están íntimamente ligados en la lógica de ventas, así que comparten migración y UI de orden. El tercero (JD-N07 cuenta de cobro) es solo cambios de plantilla PDF.

## 1. Aprobación gerencial para anticipo < 50% (JD-N04)

**BD (migración única):**
- `orders`: `requires_management_approval boolean`, `approval_status text` (`no_requerida | pendiente | aprobada | rechazada`), `approval_requested_at/by`, `approval_resolved_at/by`, `approval_note`.
- Nueva tabla `order_approval_log` (audit: acción, gerente, comentario, snapshot de valor y % anticipo).
- RPCs: `request_management_approval(order_id, note)`, `resolve_management_approval(order_id, decision, note)` — solo `admin` puede resolver (Luisa/Chiqui usarán rol admin por ahora; añado nota para tabla `management_approvers` si luego quieren restringir).
- Bloqueo: función existente de "enviar a producción" valida `approval_status IN ('no_requerida','aprobada')`.

**UI:**
- En el detalle de orden: si `anticipo < 50%` y no es Plan Separe → mostrar checkbox "Solicitar excepción de anticipo" con campo de monto real, motivo y botón "Solicitar aprobación gerencial".
- Botón "Enviar a producción" se deshabilita mientras `approval_status = 'pendiente' | 'rechazada'`.
- Nueva vista `/erp/finance/approvals` (solo admin): lista de órdenes pendientes con Aprobar / Rechazar + comentario obligatorio.
- Badge de estado en la orden ("Pendiente aprobación gerencial" / "Aprobada por X" / "Rechazada").
- Tarea automática en `seller_tasks` para admins cuando se solicita, y para el vendedor cuando se aprueba/rechaza.

**Preguntas abiertas (te dejo defaults, dime si cambio):**
- ¿Cualquier admin aprueba o requiere ambos? → Default: **cualquier admin** (más simple; se puede endurecer luego).
- ¿Monto mínimo absoluto de anticipo? → Default: **sin mínimo**, se aprueba caso por caso.

## 2. Plan Separe (JD-N05)

**BD (misma migración):**
- `orders.sale_type text` (`normal | plan_separe`, default `normal`), `separe_activated_at`, `separe_completed_at`, `price_locked_at`.
- Nueva tabla `order_separe_events` (opcional; audit de cada abono como "abono separe" además del pago normal).
- Trigger / RPC `check_separe_completion(order_id)`: cuando `sum(order_payments) >= total * 0.5` y `sale_type='plan_separe'`, marca `separe_completed_at` y desbloquea "enviar a producción" + crea tarea al vendedor "Plan Separe completado — enviar a producción".

**UI:**
- Al crear una orden: selector "Tipo de venta" (Normal / Plan Separe). En Plan Separe se permite guardar sin anticipo del 50%.
- En orden Plan Separe: bloqueo de "Enviar a producción" hasta llegar al 50%, con barra de progreso ("Abonos: $X / $Y — 32%") y CTA "Registrar abono".
- Badge "Plan Separe" en listados de órdenes + filtro en `/erp/orders`.
- Dashboard del vendedor: sección "Plan Separe activos" con % completado por cliente (agrego card en `my-tasks`).
- Nota informativa: "El precio se congela al crear el Plan Separe" (usaremos `price_locked_at = created_at`).

**Preguntas abiertas:**
- ¿Fecha límite para completar el anticipo? → Default: **sin fecha límite obligatoria**, solo alerta si pasan 30 días sin abonos nuevos (tarea automática al vendedor).
- ¿Precio congelado siempre? → Default: **sí**, `unit_price` no editable en Plan Separe una vez creado.

## 3. Cuenta de cobro — branding y limpieza (JD-N07)

**Cambios en `src/features/invoices/invoice-document.tsx`:**
- **Logo grande**: subir `logoBox` a 240×90 px (de 150×64) y quitar el bloque de texto "brandName" (queda solo logo → identidad visual limpia).
- **Colores por marca** (fallback a lo actual si no hay slug):
  - `espacio-inmobiliario`/`espacio-mobiliario` → azul cielo `#7FB8DB` (banda + acentos + total box).
  - `casa-diseno` → mantener `primary_color` actual de la marca (ya funciona bien).
  - `montenegro-design` → negro `#0a0a0a`.
  - `getova` → negro `#0a0a0a`.
- **Quitar el ítem "cuenta de cobro"** que aparece de más en el listado (revisar y limpiar).
- **Datos de la marca en header/footer**: mostrar solo `address`, `city`, `phone`. Ocultar `tax_id` (NIT), `email`, `website`, `legal_name`. (Los mantenemos en BD por si se necesitan en un futuro, solo no se pintan en el PDF.)
- **T&C**: dejo pendiente hasta que se valide con Jenny Cris (según nota en la imagen); no toco `terms_versions` hoy.

## Orden de implementación

1. **Migración única** (aprobación + Plan Separe + logs). — requiere tu aprobación por separado.
2. Server functions + hooks (`orders-approval.functions.ts`, extend `orders-sales.functions.ts`).
3. UI: detalle de orden (approval card + separe progress), formulario de nueva orden (selector tipo de venta), vista `/erp/finance/approvals`, filtros y badges en listados.
4. Cuenta de cobro: reescribir `invoice-document.tsx` con nuevos tokens de color por slug, logo grande, footer limpio.
5. QA con Playwright: crear orden Plan Separe → abonar → verificar bloqueo/desbloqueo; crear orden con anticipo 30% → solicitar aprobación → aprobar → verificar habilitación de producción; generar PDF de cada marca y validar visuales.

**Sin cambios en:** producción, logística, tesorería, comisiones — todo se mantiene, solo se añaden gates de entrada a producción.

¿Apruebas para arrancar con la migración?
