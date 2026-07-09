
-- 1) Allow operativo to delete phases
DROP POLICY IF EXISTS "Delete phases (admin or ventas)" ON public.order_item_phases;
CREATE POLICY "Delete phases (admin, ventas or production)"
  ON public.order_item_phases FOR DELETE
  USING (
    public.can_write_brand(auth.uid(), brand_id)
    OR (public.has_role(auth.uid(), 'operativo'::app_role) AND public.has_brand_access(auth.uid(), brand_id))
  );

-- 2) Auto-resolve production_review_op when production_orders.status changes away from 'pendiente'
CREATE OR REPLACE FUNCTION public.auto_resolve_production_review_op()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND OLD.status = 'pendiente' AND NEW.status <> 'pendiente' THEN
    UPDATE public.seller_tasks
       SET status = 'resuelta', resolved_at = now()
     WHERE production_order_id = NEW.id
       AND type = 'production_review_op'
       AND status = 'pendiente';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_resolve_review_op ON public.production_orders;
CREATE TRIGGER trg_auto_resolve_review_op
  AFTER UPDATE ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.auto_resolve_production_review_op();

-- 3) Auto-create review OP tasks on insert of a pending production order
CREATE OR REPLACE FUNCTION public.create_production_review_op_tasks()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
  v_seller_name text;
BEGIN
  IF NEW.status <> 'pendiente' THEN
    RETURN NEW;
  END IF;

  SELECT o.invoice_number, o.order_number, o.seller_id
    INTO v_order
    FROM public.orders o
    WHERE o.id = NEW.order_id;

  SELECT COALESCE(p.display_name, p.email, 'Vendedor')
    INTO v_seller_name
    FROM public.profiles p
    WHERE p.user_id = v_order.seller_id;

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
    'Nueva orden de producción para revisar',
    format('%s cargó la OP de la venta %s. Revisa la planimetría y acéptala o recházala.',
           COALESCE(v_seller_name, 'Vendedor'),
           COALESCE(v_order.invoice_number, v_order.order_number, '')),
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
  AFTER INSERT ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.create_production_review_op_tasks();

-- 4) Retroactive cleanup: resolve stale review_op tasks whose OP is no longer 'pendiente'
UPDATE public.seller_tasks t
   SET status = 'resuelta', resolved_at = now()
  FROM public.production_orders po
 WHERE t.production_order_id = po.id
   AND t.type = 'production_review_op'
   AND t.status = 'pendiente'
   AND po.status <> 'pendiente';
