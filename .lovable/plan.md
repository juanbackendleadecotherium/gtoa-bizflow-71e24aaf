# Fase 2 — Implementación de permisos por rol

Procedo con defaults (sin esperar respuestas):

**Decisiones asumidas**
1. **Enums actuales se mantienen**: `admin`, `ventas`, `finanzas`, `operativo`, `vendedor`, `logistica`. Los labels visibles se mapean solo en UI (`Administrador`, `Gerente Ventas`, `Gerente Finanzas`, `Operativo Bodega`, `Vendedor`, `Logística`).
2. **`logistica`** queda como rol independiente (no se toca — está fuera del alcance de esta fase, no tiene reglas definidas).
3. **`finanzas` puede crear todos los roles excepto `admin`**.
4. **Mapa de permisos en TypeScript** (`src/lib/permissions.ts`) — versionado con el código, sin tabla de BD. Se puede migrar a tabla después si se necesita edición en runtime.

## Cambios

### 1. Base de datos (migración)
- **RLS crítica en `orders`**: agregar filtro por vendedor para rol `vendedor` (solo ve sus órdenes; `ventas`/`finanzas`/`admin` ven todas de sus marcas).
- **RLS en `invoices`**: mismo patrón — vendedor solo ve facturas de sus propias órdenes.
- **RLS en `order_payments`**: vendedor solo ve pagos de sus órdenes.
- **RLS en `order_deletions`**: vendedor solo ve sus propias eliminaciones.
- **RLS en `commission_tiers`**: restringir SELECT a `finanzas` y `admin` (hoy es público autenticado).
- Helper SQL: `public.is_seller_of_order(order_id uuid)` — SECURITY DEFINER, usado por las policies.

### 2. Mapa de permisos (`src/lib/permissions.ts`)
```ts
export type ModuleKey =
  | 'dashboard' | 'orders' | 'invoices' | 'commissions'
  | 'sales_goals' | 'users' | 'brands' | 'customers'
  | 'suppliers' | 'reports_erp' | 'estados' | 'audit_logs'
  | 'order_deletions' | 'approvals';

export type Visibility = 'none' | 'own' | 'brand' | 'all';

export const PERMISSIONS: Record<AppRole, Partial<Record<ModuleKey, Visibility>>> = {
  admin:     { /* all: 'all' */ },
  finanzas:  { commissions: 'all', invoices: 'all', users: 'all' /* except admin */, ... },
  ventas:    { orders: 'brand', commissions: 'brand', sales_goals: 'all', ... },
  vendedor:  { orders: 'own', commissions: 'own', sales_goals: 'all' /* solo lectura */, ... },
  operativo: { orders: 'brand' /* solo lectura logística */, ... },
  logistica: { /* placeholder — sin cambios */ },
};

export function can(role, module): Visibility { ... }
export function useCurrentRole(): AppRole | null { ... }
```

### 3. UI — menú lateral y route guards
- `src/components/erp/ErpSidebar.tsx`: filtrar items según `PERMISSIONS[role]`.
- Hook `useHasModuleAccess(module)` en páginas ERP para redirigir a `/erp` si `visibility === 'none'`.
- Labels de rol en UI: mapa `ROLE_LABELS` en `src/lib/permissions.ts`.

### 4. Gestión de usuarios
- En el formulario de creación/edición de usuarios: `finanzas` no puede asignar rol `admin` (validación cliente + server function).
- Server function `createUser` / `updateUserRole`: verificar rol del caller antes de aceptar el rol destino.

### 5. Módulos "Gráficas ERP" y "Estados"
- Solo agregar entrada en el menú + guard de permiso. **No** implementar funcionalidad interna.

## Fuera de alcance (no tocar)
- Producción, QA, logística operativa, posventa.
- Motor de estados (solo su visibilidad).

## Verificación
- `bunx tsgo` para tipos.
- Playwright smoke: login como cada rol → verificar menú visible + intento de acceso directo a ruta prohibida redirige.

¿Procedo?
