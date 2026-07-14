-- Fix: RLS policies targeted at role `public` (e.g. SELECT on `orders`,
-- `order_item_phases`, `order_deletions`) reference helper functions whose
-- EXECUTE grant was limited to `authenticated`. In some PostgREST paths the
-- helper is evaluated as `anon`/`public`, throwing
-- `permission denied for function has_brand_access`, which the client sees as
-- "new row violates row-level security policy" during writes.
--
-- The functions are STABLE SECURITY DEFINER and internally check `auth.uid()`,
-- so granting EXECUTE to anon/public is safe: anon calls simply resolve to
-- `false` because the user id is null.

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.has_brand_access(uuid, uuid) TO anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.can_write_brand(uuid, uuid) TO anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.is_pure_vendedor(uuid) TO anon, authenticated, public;