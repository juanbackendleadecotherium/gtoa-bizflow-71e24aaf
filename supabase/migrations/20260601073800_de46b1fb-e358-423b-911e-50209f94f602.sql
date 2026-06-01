DROP TRIGGER IF EXISTS trg_log_production_changes ON public.production_orders;
CREATE TRIGGER trg_log_production_insert AFTER INSERT ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_production_changes();
CREATE TRIGGER trg_log_production_update BEFORE UPDATE ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_production_changes();