-- Fix: when a rejected production order is re-sent (status → 'pendiente' via UPDATE),
-- the "production_review_op" task for producción must be re-created. The previous
-- trigger only fired on INSERT, so producción no se enteraba de la corrección.

CREATE OR REPLACE FUNCTION public.create_production_review_op_tasks()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
  v_seller_name text;
  v_is_correction boolean := false;
  v_title text;
  v_reason text;
BEGIN
  -- Only fire when the OP ends up in 'pendiente'
  IF NEW.status <> 'pendiente' THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only when transitioning INTO 'pendiente' (avoid noise)
  IF TG_OP = 'UPDATE' AND OLD.status = 'pendiente' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'rechazada' THEN
    v_is_correction := true;
  END IF;

  SELECT o.invoice_number, o.order_number, o.seller_id
    INTO v_order
    FROM public.orders o
    WHERE o.id = NEW.order_id;

  SELECT COALESCE(p.display_name, p.email, 'Vendedor')
    INTO v_seller_name
    FROM public.profiles p
    WHERE p.user_id = v_order.seller_id;

  IF v_is_correction THEN
    v_title := 'Planimetría corregida para revisar';
    v_reason := format('%s reenvió la OP corregida de la venta %s tras el rechazo. Revísala nuevamente.',
                       COALESCE(v_seller_name, 'Vendedor'),
                       COALESCE(v_order.invoice_number, v_order.order_number, ''));
  ELSE
    v_title := 'Nueva orden de producción para revisar';
    v_reason := format('%s cargó la OP de la venta %s. Revisa la planimetría y acéptala o recházala.',
                       COALESCE(v_seller_name, 'Vendedor'),
                       COALESCE(v_order.invoice_number, v_order.order_number, ''));
  END IF;

  INSERT INTO public.seller_tasks (
    seller_id, order_id, production_order_id, brand_id,
    type, title, reason, severity, status
  )
  SELECT DISTINCT
    ur.user_id,
    NEW.order_id,
    NEW.id,
    NEW.brand_id,
    'production_review_op',
    v_title,
    v_reason,
    'warning',
    'pendiente'
  FROM public.user_roles ur
  JOIN public.user_brands ub ON ub.user_id = ur.user_id AND ub.brand_id = NEW.brand_id
  WHERE ur.role = 'operativo'
    AND NOT EXISTS (
      SELECT 1 FROM public.seller_tasks t
       WHERE t.seller_id = ur.user_id
         AND t.production_order_id = NEW.id
         AND t.type = 'production_review_op'
         AND t.status = 'pendiente'
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_review_op_tasks ON public.production_orders;
CREATE TRIGGER trg_create_review_op_tasks
  AFTER INSERT OR UPDATE OF status ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.create_production_review_op_tasks();
