
-- Backfill: recreate finance tasks for every item/phase with a pending supplier advance payment.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oi.id
    FROM public.order_items oi
    WHERE oi.ready_for_advance_payment = true
      AND oi.supplier_id IS NOT NULL
      AND oi.quotation_date IS NOT NULL
      AND COALESCE(oi.has_phases, false) = false
      AND COALESCE(oi.negotiated_cost, oi.manufacturing_cost) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.order_item_supplier_payments p
        WHERE p.order_item_id = oi.id AND p.phase_id IS NULL AND COALESCE(p.payment_type,'advance') = 'advance'
      )
  LOOP
    PERFORM public.create_supplier_payment_tasks(r.id);
  END LOOP;

  FOR r IN
    SELECT ph.id
    FROM public.order_item_phases ph
    WHERE ph.ready_for_advance_payment = true
      AND ph.supplier_id IS NOT NULL
      AND ph.quotation_date IS NOT NULL
      AND COALESCE(ph.negotiated_cost, ph.manufacturing_cost) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.order_item_supplier_payments p
        WHERE p.phase_id = ph.id AND COALESCE(p.payment_type,'advance') = 'advance'
      )
  LOOP
    PERFORM public.create_supplier_phase_payment_tasks(r.id);
  END LOOP;
END $$;
