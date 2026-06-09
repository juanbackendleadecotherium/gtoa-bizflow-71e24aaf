
CREATE OR REPLACE FUNCTION public.prevent_reassign_active_production_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_old_status text;
BEGIN
  IF NEW.production_order_id IS DISTINCT FROM OLD.production_order_id
     AND OLD.production_order_id IS NOT NULL
     AND NEW.production_order_id IS NOT NULL THEN
    SELECT status INTO v_old_status FROM public.production_orders WHERE id = OLD.production_order_id;
    IF v_old_status IS NOT NULL AND v_old_status <> 'rechazada' THEN
      RAISE EXCEPTION 'Este producto ya pertenece a una orden de producción activa. Libérelo primero rechazando o eliminando la orden anterior.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_reassign_active_production_item ON public.order_items;
CREATE TRIGGER trg_prevent_reassign_active_production_item
BEFORE UPDATE OF production_order_id ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.prevent_reassign_active_production_item();
