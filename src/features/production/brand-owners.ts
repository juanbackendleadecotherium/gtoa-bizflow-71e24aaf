// Asignación temporal de encargado de producción por marca (texto fijo).
// Se reemplazará por una tabla brand_production_owners cuando existan
// los usuarios reales (Alejandra, Jonathan) en el ERP.
export const BRAND_PRODUCTION_OWNER_BY_SLUG: Record<string, string> = {
  "espacio-inmobiliario": "Alejandra",
  "montenegro-design": "Alejandra",
  "getova": "Alejandra",
  "casa-diseno": "Jonathan",
};

export function ownerForBrandSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return BRAND_PRODUCTION_OWNER_BY_SLUG[slug] ?? null;
}
