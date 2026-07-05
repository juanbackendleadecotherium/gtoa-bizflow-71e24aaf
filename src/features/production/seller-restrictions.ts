import { useBrand } from "@/features/brands/brand-context";

/**
 * Estados en los que la OP se considera "aprobada / en producción activa".
 * A partir de este punto, el vendedor puro pierde capacidad de editar/borrar
 * planimetría y deja de ver datos internos del proceso productivo.
 */
export const LOCKED_PRODUCTION_STATUSES = [
  "en_proceso",
  "control_calidad",
  "listo",
  "entregado",
] as const;

export type LockedProductionStatus = (typeof LOCKED_PRODUCTION_STATUSES)[number];

export function isProductionLocked(status?: string | null): boolean {
  if (!status) return false;
  return (LOCKED_PRODUCTION_STATUSES as readonly string[]).includes(status);
}

/**
 * Devuelve `true` sólo para el vendedor puro (rol `ventas` sin admin ni
 * operativo). Este perfil es el que ve la información restringida cuando la
 * OP entra en producción activa.
 */
export function useSellerRestricted(): { isSellerRestricted: boolean } {
  const { roles, isAdmin } = useBrand();
  const isProduction = roles.includes("operativo");
  const isSeller = roles.includes("ventas");
  return { isSellerRestricted: isSeller && !isAdmin && !isProduction };
}
