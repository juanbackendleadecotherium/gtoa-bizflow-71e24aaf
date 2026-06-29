## Cambios en la pantalla de la orden de producción (`/erp/production/:id`)

### 1. Eliminar sección "Seguimiento (Drive)"
Quitar por completo el bloque que muestra: Novedad, Proveedor, Costo fabricación, Fecha cuenta de cobro, Planimetría enviada, Cotización, Inicio producción, Entrega prometida/real proveedor, Promesa/entrega real al cliente. Esa información ya se maneja en otro lado (márgenes por ítem y seguimiento de producción real). Los campos quedan en la BD por compatibilidad histórica pero no se editan ni muestran aquí.

### 2. Simplificar "Detalles"
Quitar **Prioridad**, **Taller / planta** e **Inicio**. La sección queda solo con:
- Estado
- Encargado (precargado por marca, ver §4)
- Entrega estimada
- Notas internas
- (la sección de Planimetrías se conserva tal cual está debajo)

## Vista por rol

El perfil que tenga **a la vez** rol `ventas` y rol `operativo`/`admin` (caso actual de `xloko2759`) ve la versión completa de producción. La vista reducida aplica al usuario que **solo** tenga rol `ventas`:

| Sección | Vendedor (solo `ventas`) | Producción (`operativo`/`admin`) |
| --- | --- | --- |
| Estado | lectura | editable |
| Encargado | lectura | editable |
| Entrega estimada | lectura | editable |
| Notas internas | **editable** | editable |
| Planimetrías | ver + subir | ver + subir + eliminar (admin) |
| Productos y márgenes (`ItemMarginsSection`) | **oculto** | visible |
| Bloque de negociación | **oculto** | visible |
| Bitácora completa | resumen | completa |

Detección: helper `useRoles()` que devuelve `{ isSeller, isProduction, isAdmin }` leyendo `user_roles`. La vista reducida se aplica cuando `isSeller && !isProduction && !isAdmin`.

## Auto-asignación del Encargado por marca

Por ahora, **texto fijo** mapeado por marca (sin vincular a usuarios reales todavía):

| Marca | Encargado |
| --- | --- |
| Espacio Inmobiliario | Alejandra |
| Montenegro Design | Alejandra |
| Getova | Alejandra |
| Casa Diseño | Jonathan |

Implementación: constante `BRAND_PRODUCTION_OWNER` en `src/features/production/brand-owners.ts`. Se aplica:
- Al **crear** la production_order desde "Enviar a producción": si `assigned_to_label` viene vacío, se setea con el mapping.
- Migración de back-fill: actualiza órdenes existentes que tengan `assigned_to_label` vacío/null. Cuando luego existan usuarios reales en el ERP, sustituiremos esta constante por una tabla `brand_production_owners` con FK a `profiles`.

## Auditoría

El trigger `log_production_changes` ya audita cambios de `status`, `assigned_to_label`, `notes`, `due_date`. Se mantiene; no requiere cambios. Cualquier edición que haga el vendedor en Notas también queda registrada con su `auth.uid()`.

## Archivos a tocar

- `src/routes/_authenticated.erp.production.$id.tsx` — eliminar bloque "Seguimiento (Drive)" y campos Prioridad/Taller/Inicio; aplicar gating por rol; precargar encargado.
- `src/features/production/send-to-production-button.tsx` — al crear la orden, setear `assigned_to_label` según marca.
- `src/features/production/brand-owners.ts` — nuevo, mapping marca→encargado.
- `src/hooks/use-roles.ts` — nuevo helper para distinguir vendedor puro vs producción.
- Migración SQL — back-fill de `assigned_to_label` en órdenes existentes según marca.

## Lo que NO cambia

- Esquema de `production_orders` (las columnas eliminadas de la UI siguen en BD).
- Módulo de márgenes (`ItemMarginsSection`) y negociación: intacto, solo se oculta para vendedor puro.
- Planimetrías, flujo de envío a producción, finalización de ítems y logística: sin cambios.
