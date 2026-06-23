
ALTER VIEW public.warehouse_item_locations SET (security_invoker = on);
REVOKE EXECUTE ON FUNCTION public.set_warehouse_movement_creator() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.validate_warehouse_movement() FROM PUBLIC, anon;
