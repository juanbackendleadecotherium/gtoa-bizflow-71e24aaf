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
