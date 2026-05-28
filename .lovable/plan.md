
## Objetivo

Hacer que la auditoría sea fácil de leer para un vendedor, y que al editar un pedido no se pierdan los cambios cuando se actualiza el estado (o cualquier otra cosa en paralelo). Además, dejar visible la nota del cambio de estado.

---

## 1. Auditoría de cambios — versión amigable

Rediseñar la tarjeta "Auditoría de cambios" para que un no-técnico la entienda de un vistazo.

**Cambios visuales**
- Timeline vertical con punto de color por tipo de acción (verde = agregado, ámbar = modificado, rojo = eliminado, azul = cambio de datos del pedido).
- Cabecera de cada evento en una sola línea legible:
  `Pedro (pedro@…) · agregó un producto · hace 5 min`
  Fecha en formato relativo ("hace 5 min", "ayer 3:42 p.m."), con la fecha completa en tooltip.
- Cuerpo del evento traducido a lenguaje natural, no JSON:
  - **Producto agregado** → `CAMA 180×190 · 1 unidad · $5.000.000`
  - **Producto modificado** → mostrar solo los campos que cambiaron, uno por línea:
    `Precio: $0 → $1.500.000`
    `Cantidad: 1 → 2`
  - **Producto eliminado** → `Se eliminó "SOFA NUBE…" (1 × $1.500.000)`
  - **Pedido** (notas, descuento, impuesto, fecha, vendedor, cliente):
    `Descuento: $0 → $200.000`
    `Entrega estimada: 28/05/2026 → 30/05/2026`
    Para notas largas, recorte con "ver más".
- Dinero siempre con `formatMoney` (separador de miles, sin código bruto tipo `1500000`).
- Agrupar eventos del mismo usuario en un rango de < 2 min en un solo bloque (evita ruido cuando se editan varios campos a la vez).
- Filtro simple arriba: `Todo / Productos / Datos del pedido / Estados` (chips).

**Implementación**
- Nuevo componente `src/features/orders/audit-timeline.tsx` que recibe `entries` y renderiza el timeline.
- Helpers `describeAction` y `describeChange` se mueven ahí y se reescriben con los formatos anteriores; el mapeo de `field` usa etiquetas en español (`notes → Notas`, `discount → Descuento`, `tax → Impuesto`, `estimated_delivery_date → Entrega estimada`, `customer_id → Cliente`, `seller_id → Vendedor`).
- Fecha relativa: helper local pequeño (sin dependencias nuevas).

---

## 2. No perder lo que se está editando

**Problema raíz:** el `useEffect` que sincroniza el formulario de edición con `orderQuery.data` se vuelve a disparar cada vez que se invalida `["order", id]` (cambio de estado, refresco de auditoría, etc.), sobrescribiendo `editItems`, `editNotes`, `editDiscount`, `editTax`, `editETA` con los valores del servidor.

**Solución**
- El efecto de hidratación solo corre cuando `editing` es `false` o cuando el id del pedido cambia. Mientras `editing === true`, el estado local manda y nunca se pisa.
- Agregar "dirty flag": si el usuario tiene cambios sin guardar y pulsa "Cancelar", confirmar antes de descartar.
- Bloquear el botón "Actualizar estado" mientras `editing === true` con un tooltip: "Guarda o cancela los cambios del pedido antes de cambiar el estado". Esto evita la condición de carrera donde un cambio de estado refresca y borra lo que se estaba editando.
  - Alternativa contemplada: permitirlo y solo evitar el reset. Elegimos bloquear porque guardar el pedido y el estado en operaciones separadas mientras hay ediciones a medias es propenso a errores (el producto nuevo aún no existe en BD cuando se intenta cambiar el estado).

---

## 3. Nota del cambio de estado: dónde queda y cómo se ve

Hoy la nota se guarda en `order_status_history.note` y se renderiza dentro de "Historial de estados", pero queda muy pequeña debajo de los badges.

**Cambios**
- En "Historial de estados" mostrar la nota en un bloque destacado (fondo `muted/40`, ícono de mensaje), no como texto secundario diminuto.
- Si la nota existe, también incluir en la auditoría un evento "Cambió el estado: En producción · Nota: …" para que el vendedor vea todo en un solo timeline.
- Toast al guardar: "Estado actualizado · nota guardada en el historial" cuando se incluyó nota, para confirmar dónde quedó.

**Fiabilidad de la nota (técnico)**
Hoy se actualiza la última fila de `order_status_history` por `created_at desc limit 1`, lo cual es frágil bajo concurrencia. Se mejora envolviéndolo: tras `update orders.status_id`, buscar la fila de historial cuyo `to_status_id = newStatus` y `created_at >= timestampAntesDelUpdate`. Sigue siendo client-side (no requiere migración) y es seguro para un solo usuario editando.

---

## Archivos a tocar

- `src/routes/_authenticated.erp.orders.$id.tsx` — efecto de hidratación condicionado a `!editing`, bloqueo del panel de estado mientras se edita, integración del nuevo timeline, mejora visual de la nota en historial, toast informativo.
- `src/features/orders/audit-timeline.tsx` — nuevo componente con el render amigable, helpers de formato y agrupación.

Sin cambios de base de datos ni de esquema.
