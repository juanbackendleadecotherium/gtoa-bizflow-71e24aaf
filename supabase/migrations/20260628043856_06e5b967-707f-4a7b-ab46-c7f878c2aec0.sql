CREATE OR REPLACE FUNCTION public.notify_seller_invoice_ready(_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_prog record;
  v_title text;
  v_reason text;
  v_label text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id;
  IF NOT FOUND OR v_order.seller_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.seller_tasks
     WHERE order_id = _order_id
       AND type = 'invoice_ready_for_collection'
       AND status = 'pendiente'
  ) THEN
    RETURN;
  END IF;

  SELECT * INTO v_prog FROM public.order_completion_progress(_order_id);

  v_label := COALESCE('Cta. cobro ' || v_order.invoice_number, v_order.order_number, 'esta venta');
  v_title := 'Cuenta de cobro lista — pendiente por logística y cobro del saldo';
  v_reason := 'La cuenta de cobro ' || v_label
           || ' pasó a "Pendiente por logística"'
           || CASE WHEN v_prog.total > 0
                THEN ' (' || v_prog.finished || '/' || v_prog.total || ' productos terminados).'
                ELSE '.' END
           || ' Coordina con el cliente el cobro del saldo pendiente.';

  INSERT INTO public.seller_tasks(
    seller_id, order_id, brand_id, type, title, reason, severity, status
  ) VALUES (
    v_order.seller_id, _order_id, v_order.brand_id,
    'invoice_ready_for_collection', v_title, v_reason, 'info', 'pendiente'
  );
END;
$function$;