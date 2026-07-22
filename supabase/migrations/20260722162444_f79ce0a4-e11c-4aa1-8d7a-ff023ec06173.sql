
CREATE OR REPLACE FUNCTION public.check_separe_completion(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric;
  v_advance numeric;
  v_paid numeric;
  v_sale_type text;
  v_already timestamptz;
  v_brand_id uuid;
  v_seller uuid;
BEGIN
  SELECT total, COALESCE(advance_amount,0), sale_type, separe_completed_at, brand_id, created_by
    INTO v_total, v_advance, v_sale_type, v_already, v_brand_id, v_seller
    FROM public.orders WHERE id = p_order_id;

  IF v_sale_type <> 'plan_separe' OR v_already IS NOT NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_paid
    FROM public.order_payments WHERE order_id = p_order_id;

  -- El anticipo inicial (advance_amount) también cuenta hacia el 30% del Plan Separe.
  v_paid := v_paid + v_advance;

  IF v_total > 0 AND v_paid >= v_total * 0.3 THEN
    UPDATE public.orders
      SET separe_completed_at = now(), updated_at = now()
      WHERE id = p_order_id;

    INSERT INTO public.seller_tasks(order_id, title, reason, type, severity, brand_id, seller_id)
    VALUES (
      p_order_id,
      'Plan Separe habilitado — listo para producción',
      'El cliente completó el 30% del anticipo. Ya puedes enviar la venta a producción. Recuerda cobrar el 20% restante hasta llegar al 50%.',
      'plan_separe_ready',
      'alta',
      v_brand_id,
      v_seller
    );
  END IF;
END $function$;

-- Backfill: aplicar el nuevo umbral a ventas Plan Separe existentes
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.orders WHERE sale_type='plan_separe' AND separe_completed_at IS NULL LOOP
    PERFORM public.check_separe_completion(r.id);
  END LOOP;
END $$;
