CREATE OR REPLACE FUNCTION public.create_supplier_payment_tasks(_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.order_items%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
  v_cost numeric;
  v_pct numeric;
  v_amount numeric;
  v_invoice text;
  v_title text;
  v_reason text;
  v_desc text;
  v_finance_user uuid;
BEGIN
  SELECT * INTO v_item FROM public.order_items WHERE id = _item_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_item.supplier_id IS NULL THEN RETURN; END IF;
  IF v_item.quotation_date IS NULL THEN RETURN; END IF;
  v_cost := COALESCE(v_item.negotiated_cost, v_item.manufacturing_cost);
  IF v_cost IS NULL OR v_cost <= 0 THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM public.order_item_supplier_payments
    WHERE order_item_id = v_item.id AND payment_type = 'advance'
  ) THEN
    RETURN;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id;
  SELECT * INTO v_supplier FROM public.suppliers WHERE id = v_item.supplier_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF COALESCE(v_supplier.requires_advance_payment, false) = false THEN
    DELETE FROM public.seller_tasks
     WHERE order_item_id = v_item.id
       AND type = 'pay_supplier_advance'
       AND status = 'pendiente';
    RETURN;
  END IF;

  v_pct := COALESCE(v_supplier.advance_payment_pct, 50);
  v_amount := round(v_cost * (v_pct / 100.0));
  v_invoice := COALESCE(v_order.invoice_number, v_order.order_number, '');
  v_desc := COALESCE(split_part(v_item.description, E'\n', 1), 'Producto');

  v_title := 'Pago a proveedor pendiente — ' || v_desc;
  v_reason :=
    'Cotización aprobada — ' || v_desc ||
    ' · Factura #' || v_invoice ||
    ' · Proveedor: ' || v_supplier.name ||
    ' · Valor a pagar (anticipo ' || round(v_pct)::text || '%): $' ||
    to_char(v_amount, 'FM999,999,999,990') ||
    '. Pendiente de pago al proveedor.' ||
    ' Cotización aprobada el ' ||
    to_char(v_item.quotation_date, 'DD/MM/YYYY') || '.';

  DELETE FROM public.seller_tasks
   WHERE order_item_id = v_item.id
     AND type = 'pay_supplier_advance'
     AND status = 'pendiente';

  -- Include admin users as well so admins also see the task and badge.
  FOR v_finance_user IN
    SELECT DISTINCT user_id FROM public.user_roles WHERE role IN ('finanzas', 'admin')
  LOOP
    INSERT INTO public.seller_tasks(
      seller_id, order_id, production_order_id, order_item_id, brand_id,
      type, title, reason, severity, status
    ) VALUES (
      v_finance_user, v_order.id, v_item.production_order_id, v_item.id, v_order.brand_id,
      'pay_supplier_advance', v_title, v_reason, 'warning', 'pendiente'
    );
  END LOOP;
END;
$$;

-- Backfill pending items so tasks exist right now.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oi.id
      FROM public.order_items oi
      JOIN public.suppliers s ON s.id = oi.supplier_id
     WHERE oi.supplier_id IS NOT NULL
       AND oi.quotation_date IS NOT NULL
       AND COALESCE(oi.negotiated_cost, oi.manufacturing_cost) > 0
       AND s.requires_advance_payment = true
       AND NOT EXISTS (
         SELECT 1 FROM public.order_item_supplier_payments p
          WHERE p.order_item_id = oi.id AND p.payment_type = 'advance'
       )
  LOOP
    PERFORM public.create_supplier_payment_tasks(r.id);
  END LOOP;
END $$;