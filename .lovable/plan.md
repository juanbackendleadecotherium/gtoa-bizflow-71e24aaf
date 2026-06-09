## Objetivo

Que la orden de producción muestre el **valor de venta** de cada producto y de la orden completa, y que cuando producción ingrese el costo de fabricación, el sistema marque con colores si el margen cumple el mínimo (45% por defecto).

## Estado actual

- Cada `production_orders` ya tiene `manufacturing_cost` y un `margin_pct` calculado a partir del **total de la venta completa** (trigger `compute_production_margin`).
- `brand_production_settings.min_margin_pct` ya guarda el mínimo por marca (45%).
- La pantalla de detalle (`/erp/production/$id`) ya muestra un margen general con semáforo (verde ≥45, amarillo 30–44, rojo <30), pero **no por producto**.
- En la cola de aprobaciones ya aparece el total, pero pequeño.

Falta: cuando una orden lleva **varios productos** (ej. cama + sofá), Mateo necesita ver el desglose individual y poder negociar cada uno por separado.

## Cambios propuestos

### 1. Base de datos
Agregar a `order_items`:
- `manufacturing_cost numeric` (lo que cobra el proveedor por ese ítem)
- `margin_pct numeric` (calculado automáticamente con trigger: `((line_total − manufacturing_cost) / line_total) × 100`)
- `supplier_id uuid` (opcional, proveedor asignado a ese ítem específico)
- `cost_notes text` (notas de negociación)

Trigger nuevo `compute_order_item_margin` que recalcule `margin_pct` al cambiar `manufacturing_cost`, `quantity` o `unit_price`.

### 2. Pantalla detalle de producción (`/erp/production/$id`)
Nueva sección **"Productos y márgenes"** entre "Detalles" y "Seguimiento (Drive)":

Tabla con una fila por producto vinculado a la orden:

```text
Producto          Cant.  Venta        Costo prov.   Margen     Proveedor
Cama king         1      $5.000.000   [ input ]     ●  44.0%   [select]
Sofá 3 puestos    1      $5.000.000   [ input ]     ●  52.0%   [select]
─────────────────────────────────────────────────────────────────────────
Totales                  $10.000.000  $5.500.000    ●  45.0%
```

Colores del margen (usando el `min_margin_pct` de la marca, por defecto 45):
- **Verde** (`emerald`): margen ≥ mínimo (cumple)
- **Amarillo** (`amber`): entre mínimo−15 y mínimo (cerca, renegociar)
- **Rojo** (`rose`): menos de mínimo−15 (crítico, requiere renegociar)
- **Gris**: sin costo aún

Cada fila tiene su propio input de costo y selector de proveedor, con guardado individual (botón "Guardar" por fila o autosave on blur).

El campo "Costo fabricación" general de la sección Drive se mantiene como suma calculada de los ítems (read-only), o se conserva para compatibilidad — a decidir según el flujo que prefieras.

### 3. Cola de aprobaciones (`/erp/production/approvals`)
- Mostrar el total de la venta más grande y visible (no como texto pequeño).
- Agregar lista resumida de productos con su valor: `Cama king · $5.000.000 · Sofá · $5.000.000`.

### 4. Indicador visual reutilizable
Crear `src/features/production/margin-pill.tsx` (componente pequeño tipo badge con punto de color + porcentaje) y usarlo en ambos sitios para mantener la misma semántica de colores.

## Preguntas antes de implementar

1. **Umbrales de color**: ¿confirmas verde ≥45%, amarillo 30–44%, rojo <30%? ¿O prefieres otras franjas (ej. amarillo 35–44, rojo <35)?
2. **Proveedor por ítem**: ¿quieres permitir un proveedor distinto por producto (cama → ebanistería, sofá → Montenegro Atelier), o un solo proveedor para toda la orden?
3. **Costo general vs. por ítem**: cuando uses el desglose por ítem, ¿el `manufacturing_cost` del encabezado se calcula automáticamente como la suma, o se elimina del formulario para evitar duplicidad?
