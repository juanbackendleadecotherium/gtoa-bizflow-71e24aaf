CREATE OR REPLACE FUNCTION public.tg_orders_prevent_draft_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_is_draft boolean := false;
  v_target_id uuid;
BEGIN
  SELECT (s.slug = 'borrador' OR s.name = 'Borrador' OR COALESCE(s.is_draft, false))
    INTO v_current_is_draft
  FROM public.order_statuses s
  WHERE s.id = NEW.status_id;

  IF COALESCE(v_current_is_draft, false) THEN
    IF NEW.sale_type = 'entrega_inmediata' THEN
      SELECT id INTO v_target_id
      FROM public.order_statuses
      WHERE brand_id = NEW.brand_id
        AND slug = 'ei-pendiente-pago'
        AND is_active = true
      ORDER BY sort_order
      LIMIT 1;
    END IF;

    IF v_target_id IS NULL THEN
      SELECT id INTO v_target_id
      FROM public.order_statuses
      WHERE brand_id = NEW.brand_id
        AND slug = 'pendiente-planimetria'
        AND is_active = true
      ORDER BY sort_order
      LIMIT 1;
    END IF;

    IF v_target_id IS NULL THEN
      SELECT id INTO v_target_id
      FROM public.order_statuses
      WHERE brand_id = NEW.brand_id
        AND is_active = true
        AND COALESCE(is_draft, false) = false
        AND slug <> 'borrador'
        AND name <> 'Borrador'
      ORDER BY sort_order
      LIMIT 1;
    END IF;

    IF v_target_id IS NULL THEN
      RAISE EXCEPTION 'No hay un estado activo válido para esta venta.';
    END IF;

    NEW.status_id := v_target_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zzz_orders_prevent_draft_status ON public.orders;
CREATE TRIGGER zzz_orders_prevent_draft_status
  BEFORE INSERT OR UPDATE OF status_id, sale_type, brand_id ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_orders_prevent_draft_status();