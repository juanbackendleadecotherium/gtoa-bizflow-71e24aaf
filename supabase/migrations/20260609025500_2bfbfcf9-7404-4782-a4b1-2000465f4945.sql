
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_brand_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_brand(uuid, uuid) TO authenticated;
