CREATE OR REPLACE FUNCTION public.prevent_production_without_management_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_status text;
BEGIN
  IF TG_TABLE_NAME = 'production_orders' THEN
    v_order_id := NEW.order_id;
  ELSE
    IF NEW.production_order_id IS NULL OR NEW.production_order_id IS NOT DISTINCT FROM OLD.production_order_id THEN
      RETURN NEW;
    END IF;
    v_order_id := NEW.order_id;
  END IF;

  IF v_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT approval_status
    INTO v_status
  FROM public.orders
  WHERE id = v_order_id;

  IF v_status = 'pendiente' THEN
    RAISE EXCEPTION 'Aprobación gerencial pendiente. Producción se habilita cuando gerencia apruebe la venta.';
  END IF;

  IF v_status = 'rechazada' THEN
    RAISE EXCEPTION 'Aprobación gerencial rechazada. No se puede enviar esta venta a producción.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_production_orders_without_management_approval ON public.production_orders;
CREATE TRIGGER trg_prevent_production_orders_without_management_approval
  BEFORE INSERT OR UPDATE OF order_id ON public.production_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_production_without_management_approval();

DROP TRIGGER IF EXISTS trg_prevent_order_items_without_management_approval ON public.order_items;
CREATE TRIGGER trg_prevent_order_items_without_management_approval
  BEFORE UPDATE OF production_order_id ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_production_without_management_approval();