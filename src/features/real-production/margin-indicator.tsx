export function formatMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

export function MarginIndicator({
  saleTotal, supplierCost, minPct,
}: { saleTotal: number; supplierCost: number | null; minPct: number }) {
  const pct = supplierCost != null && saleTotal > 0
    ? ((saleTotal - supplierCost) / saleTotal) * 100
    : null;
  const ok = pct != null && pct >= minPct;
  return (
    <div className="rounded-lg border border-border bg-background p-3 space-y-2">
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground">Venta</p>
          <p className="font-medium">{formatMoney(saleTotal)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Costo prov.</p>
          <p className="font-medium">{formatMoney(supplierCost)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Margen</p>
          <p className={`font-semibold ${pct == null ? "" : ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {pct == null ? "—" : `${pct.toFixed(1)}%`}
          </p>
        </div>
      </div>
      <p className={`text-[11px] ${ok ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>
        Mínimo requerido: {minPct}%. {pct != null && !ok && "Negocia un mejor precio antes de aprobar."}
      </p>
    </div>
  );
}
