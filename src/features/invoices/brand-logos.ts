import casaDiseno from "@/assets/brands/casa-diseno.png";
import espacio from "@/assets/brands/espacio-mobiliario.png";
import montenegro from "@/assets/brands/montenegro.webp";
import getova from "@/assets/brands/getova-logo.png";

export const BRAND_LOGOS: Record<string, string> = {
  "casa-diseno": casaDiseno,
  "espacio-inmobiliario": espacio,
  "espacio-mobiliario": espacio,
  "montenegro-design": montenegro,
  "getova": getova,
};

export function getBrandLogo(slug?: string | null, fallback?: string | null) {
  if (slug && BRAND_LOGOS[slug]) return BRAND_LOGOS[slug];
  return fallback || null;
}

/**
 * Paleta acordada por marca para el PDF de la cuenta de cobro.
 * Se prioriza este mapa; si no hay match, se usa `brand.primary_color`.
 */
const BRAND_PDF_COLORS: Record<string, string> = {
  "espacio-inmobiliario": "#7FB8DB",   // azul cielo Espacio Mobiliario
  "espacio-mobiliario": "#7FB8DB",
  "montenegro-design": "#0a0a0a",       // negro sólido
  "getova": "#0a0a0a",                  // negro sólido (mientras)
  // "casa-diseno" no está aquí a propósito → usa su primary_color de BD
};

export function getBrandInvoiceColor(slug?: string | null, fallback?: string | null): string {
  if (slug && BRAND_PDF_COLORS[slug]) return BRAND_PDF_COLORS[slug];
  if (fallback && /^#[0-9a-f]{3,8}$/i.test(fallback)) return fallback;
  return "#0f172a";
}
