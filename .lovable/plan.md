
# Seguimiento de producción — vista densa y escalable

## Problema
La tarjeta actual ocupa ~700px de alto por orden. Con 100+ OPs (como en tu Excel) el scroll es enorme. Además proveedor y costo no se ven en el header, hay que entrar a la tarjeta para verlos.

## Solución: filas-resumen expandibles + agrupación

Reemplazo el grid de tarjetas grandes por una **lista densa de filas-resumen** (≈56-72px cada una), con todo lo crítico visible inline y un panel expandible debajo para edición completa de hitos.

### 1. Fila-resumen (colapsada, default)

Una sola línea horizontal por OP, con barra de acento por estado de margen (verde/ámbar/rojo) y columnas balanceadas:

```text
┃ FAC-0001 · PROD-…00002  [Producción▾]  María Fernanda L.  ·  JDLB
┃ Mesa centro hexagonal +2 más   PROV: Maderas SA   COSTO: $810k   VENTA: $1.350k   [45.0%▲]   Entrega: 12/ago  Δ+2d   [⌄]
```

Contenido por fila (todo visible sin entrar):
- **Factura / código OP** (link)
- **Novedad pill** (editable inline con Select compacto)
- **Cliente + vendedor**
- **Resumen productos**: "Primer producto +N más" (tooltip muestra lista)
- **Proveedor** (texto)
- **Costo fabricación** (monto)
- **Venta de esta OP** (monto, negrita)
- **Margen pill** (color)
- **Entrega prometida + desviación** (`Δ+2d` rojo si tarde)
- Botón **⌄** para expandir

### 2. Panel expandible (al click en ⌄)

Se despliega debajo de la fila el detalle actual mejorado:
- Lista de productos con cantidades/precios
- Editor inline de **proveedor** y **costo de fabricación** (con separador de miles)
- Grid de hitos (factura, planimetría, cotización, inicio prod., compromiso proveedor, entrega cliente) + cálculo de desviación
- Notas y novedad

Solo una fila expandida a la vez (acordeón) para mantener foco. Estado local de expansión persiste en `useState<Set<string>>` durante la sesión.

### 3. Densidad y agrupación

- **Vista compacta por defecto** (`h-14` por fila). Tipografía `text-xs`/`text-sm`, padding apretado, divisores sutiles.
- **Header sticky** con barra de búsqueda + filtros (novedad, año) + selector de marca, ya existentes.
- **Agrupador opcional por novedad**: chips superiores (`Producción 12 · Pendiente proveedor 5 · Entrega 3…`); al clickear filtra. Reaprovecha el filtro existente.
- **Contador**: "Mostrando 47 de 132 OPs" arriba de la lista.
- **Zebra striping** sutil (`even:bg-muted/20`) para escanear filas rápido.
- **Barra de acento izquierda** de 3px con color por margen (verde ≥45%, ámbar 30-44%, rojo <30%, gris sin costo) — escaneo visual instantáneo del Excel.
- **Indicador de desviación de entrega** con punto de color (verde/ámbar/rojo) reemplazando la pill larga cuando está en fila colapsada.

### 4. Costo y proveedor editables sin expandir

Para edición rápida (uso frecuente del líder de producción):
- Click en celda **Costo** → se vuelve `MoneyInput` inline con separador de miles, blur guarda.
- Click en celda **Proveedor** → mini Select inline.
- Click en celda **Novedad** → Select inline (ya existe el patrón).

Esto evita expandir para tareas comunes.

### 5. Responsive

- En desktop (≥1280px): todas las columnas visibles.
- En tablets (768-1279px): ocultar `Vendedor` y `Cliente contacto`, mantener nombre cliente.
- En móvil (<768px): caer a tarjeta compacta (2 líneas) con expandir.

## Detalles técnicos

**Archivo único a modificar**: `src/routes/_authenticated.erp.production.tracking.tsx`
- Reemplazar `TrackingCard` por `TrackingRow` (fila colapsada) + `TrackingExpanded` (panel detalle).
- Mantener queries, mutations y realtime tal cual.
- Reutilizar `MoneyInput` de `src/features/orders/money-input.tsx` para edición inline.
- Reutilizar `MarginPill` de `src/features/production/margin-pill.tsx`.
- Estado de expansión: `const [expanded, setExpanded] = useState<string | null>(null)`.
- Persistir suppliers cargados a nivel page para usarse en el Select inline.

**Sin cambios** en base de datos, schemas, ni navegación. Solo presentación.

## Resultado esperado

- ~10-12 OPs visibles sin scroll en 1080p (vs 1-2 actualmente).
- Escaneo tipo Excel con color de margen + desviación al instante.
- Edición rápida de costo/proveedor/novedad sin entrar al detalle.
- Detalle completo a un click cuando se necesita.
