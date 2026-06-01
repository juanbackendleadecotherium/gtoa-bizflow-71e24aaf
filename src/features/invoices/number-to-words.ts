// Spanish number-to-words (Colombian style). Integers, up to billions.
const UNIDADES = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
const ESPECIALES = ["diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve"];
const DECENAS = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function dosDigitos(n: number): string {
  if (n < 10) return UNIDADES[n];
  if (n < 20) return ESPECIALES[n - 10];
  if (n < 30) {
    if (n === 20) return "veinte";
    return "veinti" + UNIDADES[n - 20];
  }
  const d = Math.floor(n / 10), u = n % 10;
  return DECENAS[d] + (u ? " y " + UNIDADES[u] : "");
}

function tresDigitos(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cien";
  const c = Math.floor(n / 100), r = n % 100;
  const cen = CENTENAS[c];
  if (!r) return cen;
  return (cen ? cen + " " : "") + dosDigitos(r);
}

function seccion(n: number, singular: string, plural: string): string {
  if (n === 0) return "";
  if (n === 1) return singular;
  return tresDigitos(n) + " " + plural;
}

export function numberToSpanishWords(num: number): string {
  if (!Number.isFinite(num)) return "";
  num = Math.abs(Math.trunc(num));
  if (num === 0) return "Cero pesos";

  const billones = Math.floor(num / 1_000_000_000_000);
  const resto1 = num % 1_000_000_000_000;
  const millones = Math.floor(resto1 / 1_000_000);
  const resto2 = resto1 % 1_000_000;
  const miles = Math.floor(resto2 / 1000);
  const resto3 = resto2 % 1000;

  const parts: string[] = [];
  if (billones) parts.push(seccion(billones, "un billón", "billones"));
  if (millones) parts.push(seccion(millones, "un millón", "millones"));
  if (miles) parts.push(miles === 1 ? "mil" : tresDigitos(miles) + " mil");
  if (resto3) parts.push(tresDigitos(resto3));

  let texto = parts.join(" ").replace(/\s+/g, " ").trim();
  texto = texto.charAt(0).toUpperCase() + texto.slice(1);
  return `${texto} pesos`;
}
