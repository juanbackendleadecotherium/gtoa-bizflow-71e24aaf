# Fix móvil del header del pedido + nota en historial de estados

## Problema 1 — Scroll horizontal en móvil

En `src/routes/_authenticated.erp.orders.$id.tsx` el contenedor de acciones del header (`<div className="flex items-center gap-2">` línea 252) **no permite wrap**, así que con badge "En producción" + Cancelar + Guardar cambios + Eliminar se sale del viewport de 390px y aparece scroll horizontal cortando el botón rojo.

**Fix de presentación (sin tocar lógica):**
- Cambiar ese contenedor a `flex flex-wrap items-center gap-2 w-full sm:w-auto justify-start sm:justify-end`.
- Hacer que en modo edición los botones "Cancelar" y "Guardar cambios" tomen `flex-1 sm:flex-none` para que en móvil cada uno ocupe la mitad de la línea y no se acumulen.
- Mover el botón "Eliminar" fuera del bloque de acciones de edición y dejarlo siempre como icono compacto al final, alineado a la derecha incluso cuando hay wrap.
- Añadir `min-w-0` al título (`<h1>`) y al wrapper de info de la izquierda para que un nombre largo nunca empuje el layout.

No se va a tocar `OrderItemsEditor` — su grid ya es responsivo; el scroll viene únicamente del header.

## Problema 2 — La nota del cambio de estado no aparece en el historial

Causa real (auditada en migración `20260521044015_...sql`):
1. El trigger `log_order_status_change` inserta la fila en `order_status_history` **sin nota** cuando hay UPDATE de `status_id`.
2. El cliente luego hace `supabase.from("order_status_history").update({ note })`.
3. Pero la tabla **solo tiene policy de SELECT** ("no insert/update/delete policies → only triggers write"). El UPDATE desde el cliente es bloqueado silenciosamente por RLS → la nota nunca se guarda. Por eso en la captura aparece "Borrador → Confirmado" sin nota a pesar de haberla escrito.

**Fix correcto — pasar la nota al trigger vía variable de sesión** (atómico, no depende de un segundo UPDATE):

Nueva migración SQL:

```sql
-- Permitir que el trigger lea una nota proporcionada por el cliente
CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note text;
BEGIN
  -- lee la nota opcional que el cliente seteó con set_config('app.status_note', ...)
  v_note := nullif(current_setting('app.status_note', true), '');

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_status_history (order_id, from_status_id, to_status_id, changed_by, note)
    VALUES (NEW.id, NULL, NEW.status_id, NEW.created_by, COALESCE(v_note, 'Pedido creado'));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.status_id IS DISTINCT FROM OLD.status_id THEN
    INSERT INTO public.order_status_history (order_id, from_status_id, to_status_id, changed_by, note)
    VALUES (NEW.id, OLD.status_id, NEW.status_id, auth.uid(), v_note);
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

-- Permitir a usuarios autenticados setear esa GUC en su sesión
GRANT EXECUTE ON FUNCTION public.log_order_status_change() TO authenticated;
```

Y un pequeño RPC para que el cliente pueda setear el GUC sin necesidad de permisos especiales:

```sql
CREATE OR REPLACE FUNCTION public.set_status_note(p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.status_note', COALESCE(p_note, ''), true); -- true = LOCAL
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_status_note(text) TO authenticated;
```

**Cambio en el cliente** (`src/routes/_authenticated.erp.orders.$id.tsx`, mutación `changeStatus`):
- Reemplazar la lógica actual (UPDATE orders + UPDATE post-hoc del historial) por:
  1. `await supabase.rpc('set_status_note', { p_note: statusNote.trim() })`
  2. `await supabase.from('orders').update({ status_id: newStatus }).eq('id', id)`
- Eliminar la búsqueda manual de la fila de historial y su UPDATE.

Nota técnica: el `set_config(..., true)` es LOCAL a la transacción. PostgREST envuelve cada request en su propia transacción, así que necesitamos que ambas llamadas vayan juntas. Como PostgREST no garantiza misma transacción entre RPC y UPDATE, lo haremos así de robusto: convertir todo a **un solo RPC** `update_order_status(p_order_id, p_status_id, p_note)` que dentro hace `set_config` LOCAL + UPDATE de orders en la misma transacción. Esa es la forma garantizada.

Versión final del RPC (reemplaza a `set_status_note`):

```sql
CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id uuid,
  p_status_id uuid,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER  -- respeta RLS del usuario sobre orders
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.status_note', COALESCE(p_note, ''), true);
  UPDATE public.orders SET status_id = p_status_id WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_order_status(uuid, uuid, text) TO authenticated;
```

El cliente queda en una sola llamada:
```ts
await supabase.rpc('update_order_status', {
  p_order_id: id, p_status_id: newStatus, p_note: statusNote.trim() || null,
});
```

## Archivos a modificar
- `src/routes/_authenticated.erp.orders.$id.tsx` — header responsive + simplificación de `changeStatus`.
- Nueva migración `supabase/migrations/<timestamp>_status_note_via_trigger.sql` con la función trigger actualizada y el RPC `update_order_status`.

## Verificación
- Móvil 390px: el header no genera scroll horizontal; el botón rojo de eliminar queda visible.
- Cambiar estado con nota → la nota aparece bajo la transición correspondiente en "Historial de estados".
- Cambiar estado sin nota → no rompe (nota queda NULL, no se muestra burbuja).