/**
 * Regla única para el "precio del ítem" en todo el módulo de producción:
 * si hubo negociación (negotiated_cost != null) se usa ese valor; si no,
 * se cae al costo original del proveedor (manufacturing_cost).
 *
 * El costo original nunca desaparece — sigue existiendo como referencia
 * interna — pero jamás debe mostrarse solo cuando existe un negociado.
 */
export type WithCosts = {
  manufacturing_cost?: number | string | null;
  negotiated_cost?: number | string | null;
};

export function getEffectiveCost(item: WithCosts | null | undefined): number | null {
  if (!item) return null;
  if (item.negotiated_cost != null && item.negotiated_cost !== "") {
    const n = Number(item.negotiated_cost);
    if (!Number.isNaN(n)) return n;
  }
  if (item.manufacturing_cost != null && item.manufacturing_cost !== "") {
    const n = Number(item.manufacturing_cost);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

export function hasNegotiation(item: WithCosts | null | undefined): boolean {
  if (!item) return false;
  if (item.negotiated_cost == null || item.negotiated_cost === "") return false;
  if (item.manufacturing_cost == null || item.manufacturing_cost === "") return true;
  return Number(item.negotiated_cost) !== Number(item.manufacturing_cost);
}
