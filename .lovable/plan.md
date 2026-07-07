# Fase 3 · Bloque 0 — Permisos del rol `vendedor` para crear ventas

## Diagnóstico (causa raíz)

Al revisar las políticas RLS en la BD, el rol `vendedor` **no tiene ningún permiso de escritura**. Todas las políticas de INSERT/UPDATE/DELETE de las tablas del flujo de venta se apoyan en la función `can_write_brand(uid, brand_id)`, cuya definición actual es:

```sql
SELECT has_role(_user_id, 'admin')
    OR (has_role(_user_id, 'ventas') AND has_brand_access(_user_id, _brand_id));
```

Solo `admin` o `ventas` pueden escribir — `vendedor` queda fuera. Por eso Claudia no puede crear la venta: cualquier INSERT en `orders`, `order_items`, `customers`, `order_payments`, `production_planimetries`, `seller_tasks` es rechazado por RLS.

Adicional: `has_brand_access` (que decide qué puede *ver*) requiere una fila en `user_brands` para ese usuario+marca. Si Claudia no está mapeada a la marca en `user_brands`, tampoco ve ni marca ni sus propios pedidos aunque se corrija la escritura.

## Cambios propuestos

### 1. Extender `can_write_brand` para incluir `vendedor` con acceso a la marca

```sql
CREATE OR REPLACE FUNCTION public.can_write_brand(_user_id uuid, _brand_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    has_role(_user_id, 'admin')
    OR (has_role(_user_id, 'ventas')    AND has_brand_access(_user_id, _brand_id))
    OR (has_role(_user_id, 'vendedor')  AND has_brand_access(_user_id, _brand_id));
$$;
```

Con esto, un vendedor asignado a la marca puede crear la venta y sus dependientes sin cambiar ninguna política individual. Las políticas SELECT que ya filtran por `is_pure_vendedor` (orders/invoices/order_payments/order_deletions) siguen funcionando: sólo ve lo suyo aunque tenga la marca.

### 2. Cerrar rutas de escritura que un vendedor no debería tocar

`can_write_brand` con vendedor incluido abre también:
- `production_orders` INSERT/UPDATE
- `production_planimetries` INSERT/UPDATE
- `order_payments` INSERT (registro de pagos del cliente)
- `seller_tasks` INSERT

Según Fase 1, el vendedor **sí** debe poder subir planimetría inicial y crear la venta, pero **no** editar producción ni registrar pagos de finanzas. Añadir políticas más estrictas encima:

- `order_payments` INSERT: restringir el WITH CHECK a `admin OR finanzas OR ventas` (nunca vendedor puro).
- `production_orders` INSERT/UPDATE: restringir a `admin OR ventas OR operativo` (excluye vendedor puro). El vendedor no lo crea directamente: lo dispara el flujo del servidor cuando corresponde.
- `production_planimetries`: dejar INSERT/UPDATE abiertos vía `can_write_brand` (vendedor sí sube planimetría inicial). El bloqueo cuando la OP entra a producción activa ya está manejado en UI (`isProductionLocked`) — no es RLS.
- `seller_tasks` INSERT: dejarlo, el vendedor puede crear sus tareas propias.

### 3. Asegurar el mapeo Claudia → marca

Verificar en `user_brands` que Claudia tenga fila para la marca donde crea ventas. Sin eso, `has_brand_access` es false y ni la SELECT del listado carga. Este es dato, no schema — se corrige desde Ajustes → Usuarios (ya soportado) o por SQL puntual.

### 4. Confirmar auto-asignación de `seller_id`

Revisar que al insertar `orders` desde el flujo del vendedor, `seller_id` se setea a `auth.uid()`. Si el formulario permite dejarlo vacío o elegir otro, el vendedor perdería visibilidad de su propia venta por la política SELECT (`is_pure_vendedor AND seller_id = auth.uid()`). Se puede blindar con un trigger `BEFORE INSERT` que, si el actor es `is_pure_vendedor` y `seller_id IS NULL`, lo fuerce a `auth.uid()`.

## Riesgo / seguridad de la venta actual

- Todos los cambios son **sólo aditivos** sobre políticas (amplían permisos del vendedor, restringen `order_payments`/`production_orders` que hoy nunca usa un vendedor). No se tocan datos ni el esquema de `orders`/`order_items`. La venta ya ingresada no se modifica.
- Antes de aplicar: correr `SELECT COUNT(*) FROM orders`, `order_items`, `order_payments` y anotar valores; verificar después que no cambian.

## Validación (criterio de aceptación)

Con Claudia logueada como vendedor puro:
1. Crea cliente nuevo → OK
2. Crea orden (auto-`seller_id`) → OK
3. Agrega ítems → OK
4. Sube planimetría → OK
5. Ve la orden en su listado, no ve las de otros vendedores → OK
6. **NO** puede registrar pago de cliente, ni forzar estado de producción → bloqueado por RLS

## Entrega

1. Migración con los cambios de las secciones 1 y 2 + trigger opcional de la sección 4.
2. Verificar/insertar la fila de `user_brands` para Claudia (sección 3) según la marca real.
3. Prueba manual del flujo end-to-end en preview antes de tocar producción.

## Pregunta antes de ejecutar

¿Confirmás que el vendedor debe estar restringido a las marcas asignadas vía `user_brands` (mismo modelo que `ventas`), y que Claudia ya debería estar mapeada a su marca? Si es así, procedo con la migración descrita.
