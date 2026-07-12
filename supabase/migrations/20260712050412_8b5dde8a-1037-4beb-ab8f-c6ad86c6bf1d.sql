REVOKE ALL ON FUNCTION public.tg_orders_prevent_draft_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_orders_prevent_draft_status() FROM anon;
REVOKE ALL ON FUNCTION public.tg_orders_prevent_draft_status() FROM authenticated;