
## Resumen

Crear un nuevo módulo independiente **Producción Real** (paralelo al módulo de Producción actual, que se queda intacto) con dos dashboards: **Producción** y **Logística**. Cada orden de "producción real" se crea a partir de una venta, sigue el flujo del mapa mental, y se entrega automáticamente a Logística cuando se marca como Terminado.

```text
Venta ──► Producción Real
            ├─ Producción (dashboard)
            │   1. Revisar planimetría
            │   2. Seleccionar proveedor
            │   3. Negociar (margen ≥ 45%)
            │   4. Aprobar proveedor
            │   5. Seguimiento producción
            │   6. Terminado ───────────┐
            │                           │ (automático)
            └─ Logística (dashboard) ◄──┘
                1. Control de calidad
                2. Entrega → Cliente | Bodega
```

## Cambios en base de datos

Nuevas tablas en `public` (con GRANTs + RLS por marca, igual al patrón existente):

- **`suppliers`** — catálogo reutilizable de proveedores por marca.
  - Campos clave: `brand_id`, `name`, `category` (ej. "sofás", "camas", "comedores"), `contact_name`, `phone`, `email`, `notes`, `is_active`.
- **`brand_production_settings`** — un registro por marca para configuración.
  - Campos clave: `brand_id` (unique), `min_margin_pct` (default 45).
- **`real_production_orders`** — orden de producción real ligada a una venta.
  - Campos clave: `brand_id`, `order_id`, `code` (auto: `RP-{slug}-{año}-{seq}`), `stage` (`planimetria` | `proveedor` | `negociacion` | `aprobado` | `seguimiento` | `terminado` | `control_calidad` | `entrega` | `entregado`), `planimetry_ok` (bool), `supplier_id`, `supplier_cost`, `sale_total_snapshot`, `margin_pct` (calculado), `supplier_approved` (bool), `delivery_target` (`cliente` | `bodega`), `qc_ok` (bool), `completed_at`, `delivered_at`, `notes`.
- **`real_production_audit_log`** — bitácora del flujo (mismo patrón que `production_audit_log`).

Función SQL `assign_real_production_code()` + trigger para generar `code`. Trigger de auditoría que registra cambios de `stage`, proveedor, margen, etc. Función `advance_real_production_stage(p_id, p_stage, p_note)` para validar transiciones (ej. no pasar a "aprobado" si margen < `min_margin_pct`).

RLS: mismas reglas que tablas existentes (`has_brand_access` para SELECT, `can_write_brand` para escritura, admin para DELETE).

## Cambios en la app

### Rutas nuevas (TanStack file-based)

- `src/routes/_authenticated.erp.real-production.tsx` — layout con `<Outlet/>` y tabs/botones **Producción** y **Logística**.
- `src/routes/_authenticated.erp.real-production.index.tsx` — redirige a `/erp/real-production/produccion`.
- `src/routes/_authenticated.erp.real-production.produccion.tsx` — dashboard de Producción (lista de órdenes en etapas planimetría→seguimiento).
- `src/routes/_authenticated.erp.real-production.logistica.tsx` — dashboard de Logística (lista en etapas control_calidad→entregado).
- `src/routes/_authenticated.erp.real-production.$id.tsx` — detalle de orden con el flujo paso a paso (revisar planimetría, elegir proveedor, registrar costo, ver % margen en vivo, aprobar, seguimiento, marcar terminado / QC / entrega).
- `src/routes/_authenticated.erp.settings.suppliers.tsx` — CRUD del catálogo de proveedores por marca.

### Componentes

`src/features/real-production/`:
- `real-production-meta.ts` — etapas, colores, labels.
- `stage-badge.tsx` — badge de etapa.
- `supplier-picker.tsx` — selector de proveedor desde catálogo (filtrado por marca + categoría).
- `margin-indicator.tsx` — muestra costo, venta, % margen y semáforo verde/rojo según `min_margin_pct`.
- `production-dashboard.tsx` — tabla/grid de órdenes en fase de producción.
- `logistics-dashboard.tsx` — tabla/grid de órdenes en fase de logística.
- `stage-stepper.tsx` — stepper visual del flujo en el detalle.
- `send-to-real-production-button.tsx` — botón en la página de venta para crear una orden de producción real (similar al existente para producción).

### Navegación

- Agregar entrada **Producción Real** en el sidebar/menú del ERP (`src/routes/_authenticated.erp.tsx`), junto a Producción.
- Agregar enlace a **Proveedores** dentro de Settings (solo admin).

### Lógica clave (cliente)

- Margen = `(sale_total - supplier_cost) / sale_total * 100` (configurable a futuro). El umbral `min_margin_pct` se lee de `brand_production_settings`.
- El botón "Aprobar proveedor" se deshabilita si `margin_pct < min_margin_pct` y muestra un mensaje pidiendo renegociar.
- Al marcar etapa **Terminado**, la orden pasa automáticamente a la lista de Logística (siguiente etapa = `control_calidad`).
- En Logística: marcar QC OK → elegir destino (Cliente / Bodega) → marcar Entregado.

## Fuera del alcance (para mantenerlo enfocado)

- No se toca el módulo de Producción existente ni sus planimetrías/órdenes.
- No se mueven datos del módulo viejo al nuevo (corren en paralelo).
- No se generan PDFs nuevos en esta fase (se pueden agregar después).
- No se integra inventario/bodega real — "Bodega" es solo una marca de destino.
