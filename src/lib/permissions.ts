/**
 * Permisos por rol — mapa centralizado.
 *
 * Fuente única de verdad para:
 *   - Filtrar el menú lateral.
 *   - Redirigir cuando un usuario intenta acceder por URL directa.
 *   - Etiquetas de rol en la UI.
 *
 * Las políticas RLS de la BD son la barrera real de seguridad.
 * Este mapa es sólo la capa de UX (mostrar/ocultar).
 */

export const APP_ROLES = [
  "admin",
  "ventas",
  "finanzas",
  "vendedor",
  "operativo",
  "logistica",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type ModuleKey =
  | "dashboard"
  | "orders"
  | "production"
  | "warehouse"
  | "logistics"
  | "analytics"
  | "my_tasks"
  | "finance"
  | "supplier_payments"
  | "commissions"
  | "sales_goals"
  | "estados"
  | "suppliers"
  | "warehouses"
  | "brand_billing"
  | "terms"
  | "users"
  | "database";

/** Niveles de visibilidad — informativo por ahora, útil si mañana granulamos. */
export type Visibility = "none" | "own" | "brand" | "all";

/**
 * Etiquetas en español para mostrar en la UI.
 */
export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  ventas: "Gerente de Ventas",
  finanzas: "Gerente de Finanzas",
  vendedor: "Vendedor",
  operativo: "Operativo de Bodega",
  logistica: "Logística",
};

/**
 * Matriz de permisos por rol.
 * "none" = oculto / bloqueado. Los ausentes se tratan como "none".
 */
export const PERMISSIONS: Record<AppRole, Partial<Record<ModuleKey, Visibility>>> = {
  admin: {
    dashboard: "all",
    orders: "all",
    production: "all",
    warehouse: "all",
    logistics: "all",
    analytics: "all",
    my_tasks: "all",
    finance: "all",
    supplier_payments: "all",
    commissions: "all",
    sales_goals: "all",
    estados: "all",
    suppliers: "all",
    warehouses: "all",
    brand_billing: "all",
    terms: "all",
    users: "all",
    database: "all",
  },
  finanzas: {
    dashboard: "all",
    orders: "brand",
    my_tasks: "all",
    finance: "all",
    supplier_payments: "all",
    commissions: "all",
    sales_goals: "all",
    analytics: "all",
    estados: "all",
    users: "all", // no puede crear/editar rol admin (validado en server fn)
  },
  ventas: {
    dashboard: "brand",
    orders: "brand",
    my_tasks: "all",
    sales_goals: "all",
    commissions: "brand",
    analytics: "brand",
    estados: "brand",
  },
  vendedor: {
    dashboard: "own",
    orders: "own",
    my_tasks: "own",
    sales_goals: "all", // sólo lectura — metas globales
    commissions: "own",
    estados: "own",
  },
  operativo: {
    dashboard: "brand",
    orders: "brand",
    production: "brand",
    warehouse: "brand",
    my_tasks: "all",
  },
  logistica: {
    dashboard: "brand",
    logistics: "all",
    my_tasks: "all",
  },
};

/**
 * Devuelve la visibilidad efectiva de un módulo para el set de roles del usuario.
 * Toma el nivel más permisivo entre todos los roles asignados.
 */
export function moduleVisibility(roles: AppRole[], module: ModuleKey): Visibility {
  const order: Visibility[] = ["none", "own", "brand", "all"];
  let best: Visibility = "none";
  for (const r of roles) {
    const v = PERMISSIONS[r]?.[module] ?? "none";
    if (order.indexOf(v) > order.indexOf(best)) best = v;
  }
  return best;
}

/** Shortcut: ¿puede al menos ver el módulo? */
export function canAccess(roles: AppRole[], module: ModuleKey): boolean {
  return moduleVisibility(roles, module) !== "none";
}

/**
 * Roles que un usuario dado puede asignar al crear/editar a otro.
 * - admin: cualquiera.
 * - finanzas: todos excepto admin.
 * - resto: ninguno.
 */
export function assignableRoles(actorRoles: AppRole[]): AppRole[] {
  if (actorRoles.includes("admin")) return [...APP_ROLES];
  if (actorRoles.includes("finanzas")) return APP_ROLES.filter((r) => r !== "admin");
  return [];
}

export function canManageUsers(actorRoles: AppRole[]): boolean {
  return actorRoles.includes("admin") || actorRoles.includes("finanzas");
}
