
CREATE OR REPLACE FUNCTION public.notify_seller_production_accepted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller uuid;
  v_order_number text;
  v_invoice_number text;
  v_products text;
BEGIN
  -- Solo cuando pasa de pendiente -> en_proceso (aceptación de planimetría)
  IF NOT (OLD.status = 'pendiente' AND NEW.status = 'en_proceso') THEN
    RETURN NEW;
  END IF;

  SELECT o.seller_id, o.order_number, o.invoice_number
    INTO v_seller, v_order_number, v_invoice_number
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF v_seller IS NULL THEN
    RETURN NEW;
  END IF;

  -- Lista de productos de la OP (primera línea de cada descripción)
  SELECT string_agg('• ' || split_part(COALESCE(oi.description, 'Sin descripción'), E'\n', 1), E'\n')
    INTO v_products
  FROM public.order_items oi
  WHERE oi.production_order_id = NEW.id;

  INSERT INTO public.seller_tasks (
    seller_id, order_id, production_order_id, brand_id,
    type, title, reason, severity, status
  ) VALUES (
    v_seller,
    NEW.order_id,
    NEW.id,
    NEW.brand_id,
    'production_accepted',
    format('Producción aceptó tu venta %s',
      COALESCE(v_invoice_number, v_order_number, '')),
    format('¡Buenas noticias! Producción aprobó la planimetría y ya arrancó con:%s%s',
      E'\n\n', COALESCE(v_products, '(sin productos vinculados)')),
    'info',
    'pendiente'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_seller_production_accepted ON public.production_orders;
CREATE TRIGGER trg_notify_seller_production_accepted
  AFTER UPDATE OF status ON public.production_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_seller_production_accepted();
