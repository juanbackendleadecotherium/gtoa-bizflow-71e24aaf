# Planimetría: layout eficiente + editor de anotaciones

Dos cambios independientes sobre el flujo actual de planimetría.

## 1) Layout del PDF más denso y estandarizado

Hoy la planimetría del producto ocupa una página completa nueva (`break`) con la imagen subida muy grande. Se rediseña la página para que **una sola hoja** contenga todo lo posible:

```text
┌──────────────────────────────────────────────────────────┐
│  HEADER (igual que hoy)                                  │
├───────────────────────────┬──────────────────────────────┤
│  IMAGEN DE REFERENCIA     │  CANT · Fecha de entrega     │
│  (44% ancho, altura fija) │  Especificaciones (texto)    │
│  Nombre producto          │                              │
│                           │                              │
│  PLANIMETRÍA DEL VENDEDOR │  Notas de la venta           │
│  (mismo 44%, altura fija) │  (si hay)                    │
│  Caption                  │                              │
│                           │  Referencias adicionales     │
│                           │  (mini-thumbs 3 por fila)    │
└───────────────────────────┴──────────────────────────────┘
                  FOOTER (igual que hoy)
```

Cambios concretos en `src/features/production/planimetry-document.tsx`:
- Mover el bloque `PLANIMETRÍA DEL VENDEDOR` dentro de la columna izquierda, debajo del hero, **eliminando el `break` que la mandaba a página nueva**.
- Estandarizar tamaños del frame para que toda imagen entre se redimensione a un cuadro fijo (`width: 100%`, `height: 220 pt`, `objectFit: contain`, fondo blanco). Esto garantiza misma altura sin importar la resolución original (la compresión a 1400 px ya existe en `send-to-production-button.tsx`).
- Mover "Referencias adicionales" y "Notas" a la columna derecha, debajo de Especificaciones, con thumbnails más pequeños (3 por fila, altura 90 pt).
- Si hay múltiples planimetrías del vendedor, mostrarlas en grilla 2 columnas dentro de la columna izquierda (altura 130 pt cada una) en lugar de stack vertical.
- Si hay >1 PDF adjunto, mantener el aviso de "Planimetría adjunta en PDF: ..." al pie de la columna izquierda.
- Eliminar la sección `planiSection` con `break`. El segundo page break solo ocurre si el contenido realmente no cabe (let `@react-pdf` decida).

Resultado: cada producto = 1 hoja en la mayoría de casos (vs 2 hoy).

## 2) Editor de anotaciones después de generada

Botón nuevo **"Anotar"** junto a cada versión de planimetría ya generada (en el panel donde hoy se ve el PDF y se descarga). Al pulsarlo abre un modal a pantalla casi completa con el PDF rasterizado como fondo y herramientas de marcado encima.

### Herramientas
- **Lápiz a mano alzada** (grosor 2 px)
- **Resaltador** (grosor 14 px, opacidad 0.35)
- **Flecha recta** (click-drag, punta de flecha al soltar)
- **Nota memo** (cuadro amarillo con texto editable, draggable, posición libre)
- **Borrar último trazo** (undo) + **Limpiar todo**

### Paleta
3 colores fijos pensados para impresión: **rojo (#D32F2F)**, **azul (#1565C0)**, **negro (#111)**. El resaltador usa una versión clara automática del color seleccionado.

### Guardado
Al confirmar:
1. Renderiza cada página: PDF original → canvas + overlay de anotaciones → flatten a JPEG.
2. Compone un nuevo PDF con esas páginas (vía `@react-pdf/renderer` usando solo `<Image>` por página).
3. Sube el nuevo PDF al bucket `production-planimetries` como **nueva versión** (`vN+1`) usando el mismo flujo de `production_planimetries.insert` que ya existe.
4. Notas: `"Versión con anotaciones del vendedor"`.

Así la versión anotada queda visible para producción exactamente igual que cualquier otra, sin tocar la versión original.

### Archivos involucrados
- `src/features/production/planimetry-document.tsx` — rediseño del layout.
- `src/features/production/planimetry-annotator.tsx` *(nuevo)* — modal con canvas + herramientas.
- `src/lib/planimetry-annotate.ts` *(nuevo)* — utilidades: PDF → imágenes (pdfjs-dist), flatten canvas, build new PDF, upload + insertar versión.
- Punto de entrada del botón "Anotar": componente que lista versiones de planimetría en el detalle de la orden de producción (lo localizaré en build mode dentro de `src/routes/_authenticated.erp.production.$id.tsx` o el componente que ya lista las versiones).

### Dependencias nuevas
- `pdfjs-dist` para rasterizar páginas del PDF generado dentro del navegador.

## Detalles técnicos

- El editor trabaja siempre en cliente; el resultado se sube ya aplanado, así producción no necesita un visor con capas.
- Cada página del PDF original se renderiza a 150 dpi al canvas base, las marcas se dibujan en un canvas overlay y se aplanan en un único JPEG por página antes de re-empaquetar.
- Las notas memo son `<div>` HTML mientras se edita; al guardar se "imprimen" sobre el canvas usando `fillRect` (fondo) + `fillText` (texto multilínea con `measureText`).
- El versionado reutiliza la lógica existente de `production_planimetries.version` (next = max+1 por `order_item_id`).
- No se cambia el flujo "Enviar a producción"; el editor se activa **después** de generar.

## Fuera de alcance

- Reordenar el módulo de producción o cambiar permisos.
- Anotaciones colaborativas o multi-usuario.
- Edición de la planimetría original (no se reemplaza, se versiona).
