
REVOKE EXECUTE ON FUNCTION public.update_order_status(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_order_with_reason(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_production_with_reason(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_production_with_reason(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_order_status(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_order_with_reason(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_production_with_reason(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_production_with_reason(uuid, text) TO authenticated;
