## 1. PDF de la cuenta de cobro — márgenes profesionales tipo APA

**Archivo:** `src/features/invoices/invoice-document.tsx`

- Subir los márgenes laterales y verticales a un estilo APA-like:
  - `paddingHorizontal` global de la `Page`: **56pt** (~2 cm).
  - `paddingTop`: **48pt**, `paddingBottom`: **130pt** (deja espacio al footer fijo).
- Eliminar los `paddingHorizontal: 40` repetidos en headerWrap, partiesWrap, tableWrap, wordsRow y bottomRow (ahora hereda del page padding).
- La banda de color (`accent`) se renderiza fuera del padding (full-bleed superior) usando `position: absolute; top: 0; left: 0; right: 0`.
- Footer fijo: `left: 56, right: 56, bottom: 36`, con `borderTopColor` y el mismo respeto de márgenes.
- Garantizar que la tabla de ítems use `wrap` por fila y agregar `break` lógico (ya está `wrap={false}` por fila); añadir cabecera repetida con `fixed` en el `<View>` de `th` para que el header de la tabla se repita en cada página.
- En la sección de totales/notas (`bottomRow`) marcarla como `wrap={false}` (ya está) — verificado.

Resultado: documento con respeto de márgenes consistente en todas las páginas, look más editorial / APA.

---

## 2. Costo proveedor con negociación (margen < 45%)

### 2.1 Base de datos
Migración Supabase:

- `order_items`: agregar columnas
  - `negotiated_cost numeric` (nullable) — costo después de negociar
  - `negotiated_at timestamptz` — cuándo se registró
  - `negotiated_by uuid` — quién lo negoció (referencia a `auth.users`)
- Recalcular vistas/triggers de margen que usen `manufacturing_cost`:
  - Si `negotiated_cost` no es null → `effective_cost = negotiated_cost`.
  - Si es null → `effective_cost = manufacturing_cost`.
- Actualizar el cálculo de `margin_pct` (trigger existente) para usar `effective_cost`.
- Conservar siempre **ambos** valores (original + negociado) para auditoría y comisiones.

### 2.2 UI — `src/features/production/item-margins-section.tsx`

En cada `ItemCard`:

1. Calcular margen "preliminar" con `manufacturing_cost` (costo original del proveedor).
2. **Si margen < `min` (45%)**, mostrar bajo el input actual un nuevo bloque destacado en ámbar:
   - Label: **"Costo proveedor con negociación (COP)"** + ícono `Handshake`.
   - `MoneyInput` para `negotiated_cost`.
   - Texto auxiliar: "Este será el costo real que tomará producción para el cálculo del margen final".
3. El **MarginPill** principal cambia a usar `negotiated_cost` cuando existe; mostrar también un pequeño chip secundario con el margen original tachado para evidenciar el ahorro: `2.000.000 → 1.000.000 · ahorro 50%`.
4. El KPI "Costo total" y "Margen global" del header usan el `effective_cost`.
5. Persistir `negotiated_cost`, `negotiated_at = now()`, `negotiated_by = user.id` en el `save` mutation (junto a los campos existentes).

### 2.3 Visibilidad / auditoría
- En `audit-timeline.tsx` de producción, registrar el evento `cost_negotiated` con `{original, negotiated, savings_pct}` para que quede traza de la negociación (útil para comisiones).
- No requiere cambios en bodega ni en logística.

---

## Notas técnicas

- El campo original `manufacturing_cost` se mantiene intacto — no se sobreescribe nunca con el negociado.
- El input "Costo proveedor con negociación" sólo aparece cuando hay un `manufacturing_cost > 0` y el margen calculado con éste está por debajo del mínimo de la marca.
- Si después de negociar el margen sigue por debajo del 45%, el pill queda en rojo pero ya queda registro de que sí se intentó negociar (importante para las comisiones).
