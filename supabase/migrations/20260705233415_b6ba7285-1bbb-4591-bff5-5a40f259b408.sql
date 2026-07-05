REVOKE ALL ON FUNCTION public.prevent_production_without_management_approval() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_production_without_management_approval() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_production_without_management_approval() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_production_without_management_approval() TO service_role;