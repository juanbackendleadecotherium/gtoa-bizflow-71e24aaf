## Ajustes al módulo de bodega

### 1. Sembrar la bodega principal con 5 zonas

Migración SQL idempotente que:
- Asegura que exista una bodega llamada "Bodega principal" (insert si no existe, por `name`).
- Inserta `Zona 1` … `Zona 5` ligadas a esa bodega, todas activas, sin descripción ni capacidad.
- Usa `ON CONFLICT (zone_code) DO NOTHING` para no duplicar si ya existen.
- No toca estructura de tablas, solo datos.

Quedan totalmente editables desde `/erp/settings/warehouses` (panel ya construido).

### 2. Mostrar valor en dinero por producto, por zona y total

Fuente de precio: `order_items.unit_price` (precio de venta unitario, el mismo que ya se usa en el módulo de Ventas). Valor por ítem = `unit_price * quantity` (es lo que se le cobra al cliente por esa línea — equivalente al `line_total` ya calculado por la BD). No se usa `manufacturing_cost`.

Cambios solo en código (sin tocar `warehouse_movements`, `warehouse_zones`, `warehouses`):

**`src/lib/warehouse.functions.ts`**
- `listZoneSummary`: además del conteo, calcular por zona la suma de `unit_price * quantity` de los `order_items` actualmente ubicados (cruzando el view `warehouse_item_locations` con `order_items`). Devolver `current_value` por zona. Resolverlo en una sola query adicional (select de `order_items` por los `item_id` del view) y agrupar en memoria.
- `listZoneContents`: incluir `unit_price`, `quantity` y `line_value = unit_price * quantity` en cada ítem retornado.

**`src/routes/_authenticated.erp.warehouse.tsx`**
- `ZoneCard`: bajo el conteo de productos, mostrar el valor de la zona formateado en COP.
- `ZoneSummary`: encima de la grilla, un encabezado con el **total general** = suma de `current_value` de todas las zonas activas.
- `ZoneContents` (sheet): junto a cada producto mostrar su precio de venta (`line_value`, con `quantity × unit_price` si `quantity > 1`), y al final un subtotal de la zona.
- Formato moneda con `Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })`.

**Realtime**
- Ya cubierto: `useWarehouseRealtime` invalida `["warehouse"]` ante cualquier cambio en `warehouse_movements`, por lo que tanto los conteos como los nuevos totales se recalculan al instante en cada ingreso/salida. No requiere cambios.

### Archivos tocados
- Nueva migración (seed de bodega + 5 zonas).
- `src/lib/warehouse.functions.ts` (extender 2 funciones existentes).
- `src/routes/_authenticated.erp.warehouse.tsx` (mostrar valores).
