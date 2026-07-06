# Fase 1 — Auditoría del sistema de roles y permisos

**Sin cambios aplicados.** Este es el reporte que pediste antes de aprobar Fase 2.

## (a) Estado actual del sistema de roles

**Patrón correcto ya implementado.** El proyecto sigue exactamente el patrón recomendado: roles en tabla separada + función `security definer`. No hay roles embebidos en `profiles`.

- Enum `public.app_role` con **6 valores**: `admin`, `operativo`, `finanzas`, `ventas`, `vendedor`, `logistica`.
- Tabla `public.user_roles(user_id, role)` con políticas RLS: solo admins insertan/actualizan/borran; usuario ve las propias.
- Función `public.has_role(_user_id uuid, _role app_role)` — `STABLE SECURITY DEFINER`, `search_path = public`. Correcta.

**Discrepancias de nombres vs tu spec de 5 roles:**

| Tu spec | En BD | Nota |
|---|---|---|
| `vendedor` | `vendedor` | ✅ |
| `ventas_gerente` | `ventas` | ⚠️ nombre distinto (hoy es "ventas") |
| `finanzas_gerente` | `finanzas` | ⚠️ nombre distinto |
| `operativo_bodega` | `operativo` | ⚠️ nombre distinto |
| `administrador` | `admin` | ⚠️ nombre distinto |
| — | `logistica` | 🆕 rol extra en BD no contemplado en tu spec |

Datos reales hoy en `user_roles`: solo existen usuarios con rol `vendedor` y `admin`. Los demás roles están definidos pero sin usuarios asignados.

**Decisión pendiente**: ¿mantenemos los nombres cortos actuales (`ventas`, `finanzas`, `operativo`, `admin`) y solo mapeamos en la UI, o renombramos el enum a los de tu spec? Renombrar enum implica migración con `ALTER TYPE ... RENAME VALUE`. Recomiendo **mantener los nombres cortos** y usar labels en UI — el enum ya está en producción. Y decidir qué hacer con `logistica` (dejarlo, o fusionarlo con `operativo`).

## (b) Cómo se arma el menú hoy

**Hardcoded en el componente**, no en tabla de configuración. En `src/routes/_authenticated.erp.tsx`:

- Array `NAV: NavItem[]` estático con flags booleanos por item: `adminOnly`, `logisticsOnly`, `financeOnly`.
- Filtro en render: `NAV.filter((i) => (!i.adminOnly || isAdmin) && (!i.logisticsOnly || isLogistics) && (!i.financeOnly || isFinance))`.
- `isAdmin` viene de `useBrand()`; `isLogistics = isAdmin || roles.includes("logistica")`; `isFinance = isAdmin || roles.includes("finanzas")`.
- No hay concepto de "vendedor puro" ni "ventas gerente" en el menú — hoy ambos ven exactamente los mismos items no-admin.

**Consecuencia**: el rol `vendedor` hoy ve ítems que tu spec le prohíbe (p. ej. Producción, Bodega, Finanzas). Y no hay diferenciación `ventas` vs `vendedor` en el menú.

## (c) Estado de RLS en finanzas / comisiones

**Parcialmente correcto**, pero con brechas frente a tu spec:

- `commission_requests` SELECT: `seller_id = auth.uid() OR admin OR finanzas`. ✅ vendedor ve solo lo suyo.
- `commission_audit_log` SELECT: admin/finanzas/dueño de la commission_request. ✅
- `commission_tiers` SELECT: `true` (cualquier autenticado lee). ⚠️ aceptable si son públicos internos.
- `sales_goals` SELECT: admin, o `seller_id = auth.uid()`, o (goal de marca sin seller_id y usuario tiene acceso a la marca). ✅ compatible con "vendedor ve metas globales por marca".
- `orders`, `invoices`, `order_payments`, `order_deletions` SELECT: todas usan `has_brand_access(auth.uid(), brand_id)`. ⚠️ **No filtran por vendedor**: un `vendedor` que tenga acceso a la marca X puede leer TODAS las órdenes/facturas/pagos/eliminaciones de la marca X, incluidas las de otros vendedores. Esto **viola** tu regla no-negociable de "resumen propio, eliminaciones propias, aprobaciones propias".

**Brecha crítica** que Fase 2 debe cerrar: dividir SELECT en dos políticas — `vendedor` ve solo filas con `seller_id = auth.uid()`; `ventas` (gerente), `finanzas` y `admin` ven todo dentro de las marcas a las que tienen acceso.

## (d) Restricción de creación de usuarios

**Hoy: solo `admin` puede tocar el módulo Usuarios.** En `src/lib/admin-users.functions.ts` toda función privilegiada (`createUserAccount`, `listUsers`, `setUserRoles`, etc.) empieza con `has_role(auth.uid(), 'admin')` — si no es admin, throw.

- **No existe hoy** ninguna restricción diferenciada para `ventas` o `finanzas` sobre qué rol pueden crear. Sencillamente no pueden entrar al módulo.
- La ruta `/erp/settings/users` está marcada `adminOnly: true` en el sidebar, pero el guard real vive en el server function (correcto).
- Guardas de "último admin" ya implementadas (`assertNotLastAdminRemoval`, no borrar/suspender último admin, no auto-quitarse admin). ✅

**Respuesta a tu asunción**: hoy no hay contradicción — simplemente `finanzas` no tiene acceso alguno. Tu regla propuesta (finanzas crea todos excepto admin; ventas_gerente solo crea vendedor) es **nueva** y hay que implementarla en Fase 2. No hay conflicto con lógica existente.

## (e) Rutas sin guard de rol

**Todas las rutas ERP están bajo `/_authenticated/erp/*`**, protegidas por el layout `_authenticated/route.tsx` (auth check, no rol check). Cada ruta hija **no tiene `beforeLoad` que verifique rol**. Ejemplos accesibles por URL directa para cualquier usuario autenticado:

- `/erp/finance`, `/erp/finance/supplier-payments`, `/erp/finance/commissions`, `/erp/finance/treasury`, `/erp/finance/goals`, `/erp/finance/sellers`, `/erp/finance/receivables`, `/erp/finance/deletions`, `/erp/finance/approvals`
- `/erp/analytics`, `/erp/analytics/operations`
- `/erp/logistics/pickups`
- `/erp/settings/statuses`, `/erp/settings/suppliers`, `/erp/settings/warehouses`, `/erp/settings/brand-billing`, `/erp/settings/terms`, `/erp/settings/database`
- `/erp/production/*`, `/erp/real-production/*`, `/erp/warehouse`

**Defensa actual**: la mayoría de estas páginas llaman server functions que internamente verifican rol vía `has_role` (como `admin-users.functions.ts`). Pero **la página se renderiza igual** — mostrando UI vacía o errores en lugar de un redirect limpio. Y no todas las server functions de finanzas/logística verifican rol; hay que auditar caso por caso en Fase 2.

**Ejemplo concreto**: un `vendedor` puede navegar directo a `/erp/finance/sellers` o `/erp/analytics` — el sidebar no lo muestra, pero la URL funciona.

## Resumen ejecutivo

| Ítem | Estado |
|---|---|
| Patrón `user_roles` + `has_role` | ✅ Correcto, reutilizable |
| Nombres de roles vs spec | ⚠️ Diferentes; decidir mapear o renombrar |
| Rol `logistica` extra | ⚠️ No contemplado en spec |
| Menú por permisos | ❌ Hardcoded, no diferencia `ventas` vs `vendedor` |
| RLS comisiones/goals | ✅ Correcto |
| RLS orders/invoices/payments/deletions | ❌ **Brecha crítica**: vendedor ve datos de otros vendedores en la misma marca |
| Módulo Usuarios | ✅ Solo admin. Falta la lógica ventas/finanzas de Fase 2 |
| Guards de ruta por rol | ❌ No existen; defensa solo a nivel server function (parcial) |

## Preguntas antes de Fase 2

1. **Nombres de rol**: ¿mantengo los actuales (`admin`, `ventas`, `finanzas`, `operativo`, `vendedor`) y solo mapeo labels en UI? (Recomendado.)
2. **`logistica`**: ¿lo mantengo como rol independiente, lo fusiono en `operativo`, o lo elimino?
3. **Confirmación asunción finanzas_gerente**: ¿confirmas que `finanzas` puede crear todos excepto `admin`?
4. **Tabla de permisos por módulo** vs seguir con flags: tu spec pide tabla `(role, module_key, visibility_level)`. ¿La quieres realmente como tabla en BD (más flexible, editable sin deploy) o basta con un mapa TS versionado en código (más simple, tipado)? Recomiendo mapa TS a menos que quieras editar permisos desde UI en runtime.

Responde estas 4 y armo el plan de Fase 2 con migraciones, políticas RLS reforzadas, guards de ruta y refactor del sidebar.
