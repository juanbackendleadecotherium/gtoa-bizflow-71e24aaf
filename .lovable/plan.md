## Problema

Hoy el botón **"Enviar a producción"** siempre crea una nueva `production_order` (PROD-…-00005, 00006…) con una nueva planimetría. Cuando agregas un segundo producto a una venta existente y vuelves a mandar, te queda una orden duplicada en producción aunque sea la misma venta.

## Solución

Convertir el botón en un flujo inteligente:

1. **Si la venta NO tiene orden de producción:** funciona igual que hoy — crea PROD nueva + planimetría v1.
2. **Si la venta YA tiene una o más órdenes:** abrir un diálogo con dos opciones:
   - **Actualizar orden existente** (recomendado): selecciona la orden (PROD-...-00004) y se genera una nueva versión de planimetría (v2, v3…) con todos los productos actuales de la venta. **No se crea una orden nueva.** La planimetría anterior queda guardada como versión histórica.
   - **Crear orden nueva**: comportamiento actual, útil si realmente quieres separar (ej. dos talleres distintos).

## Cambios técnicos

**Archivo: `src/features/production/send-to-production-button.tsx`**

- Renombrar la acción "Enviar a producción" para que, cuando ya exista al menos una orden, abra un nuevo `Dialog` en vez de ejecutar el mutation directo.
- El diálogo muestra:
  - Lista de órdenes existentes con su código (PROD-…-00004), estado y workshop, con radio para elegir cuál actualizar.
  - Opción adicional "Crear una orden nueva".
  - Botón confirmar.
- Refactorizar la lógica de generación de PDF en una función `generatePlanimetryForOrder(productionOrderId, brandId, orderId)` reutilizable, que:
  - Carga la venta + items + brand + seller actuales.
  - Calcula la siguiente `version` consultando `production_planimetries` por `production_order_id` (max+1).
  - Sube el PDF a `production-planimetries` con path versionado.
  - Inserta fila en `production_planimetries` con la nueva `version` y nota "Regenerada tras edición de la venta".
  - **No borra** las planimetrías anteriores — quedan como historial (ya soportado por el esquema actual con la columna `version`).
- El mutation existente `create` se divide en dos caminos:
  - `createNewProduction()` — crea PROD nueva + llama `generatePlanimetryForOrder` con `version=1`.
  - `regenerateForExisting(productionOrderId)` — solo llama `generatePlanimetryForOrder`, sin tocar `production_orders`.
- Mensajes toast: "Planimetría v2 generada para PROD-…-00004" o "Nueva orden de producción creada".

**No requiere migración de base de datos** — la tabla `production_planimetries` ya tiene la columna `version` y soporta múltiples filas por `production_order_id`.

## Resultado

- Venta con sofá → "Enviar a producción" → crea PROD-…-00004 con planimetría v1 (sofá).
- Editas la venta, agregas comedor → "Enviar a producción" → diálogo → eliges actualizar PROD-…-00004 → genera planimetría v2 (sofá + comedor) dentro de la misma orden.
- En el detalle de PROD-…-00004 ves ambas versiones de la planimetría (v1 y v2) en el historial.
