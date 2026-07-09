
-- 1) Approval columns on phases
ALTER TABLE public.order_item_phases
  ADD COLUMN IF NOT EXISTS ready_for_advance_payment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ready_for_advance_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_for_advance_payment_by uuid;

-- 2) Backfill: any phase that already has an advance payment or a pending finance task is considered approved
UPDATE public.order_item_phases ph
   SET ready_for_advance_payment = true,
       ready_for_advance_payment_at = COALESCE(ph.ready_for_advance_payment_at, now())
 WHERE ph.ready_for_advance_payment = false
   AND EXISTS (
     SELECT 1 FROM public.order_item_supplier_payments p
      WHERE p.phase_id = ph.id AND p.payment_type = 'advance'
   );

-- 3) Per-phase task creator (mirrors create_supplier_payment_tasks)
CREATE OR REPLACE FUNCTION public.create_supplier_phase_payment_tasks(_phase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phase public.order_item_phases%ROWTYPE;
  v_item  public.order_items%ROWTYPE;
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
  SELECT * INTO v_phase FROM public.order_item_phases WHERE id = _phase_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Clear any pending phase-specific finance task; recreate only when conditions met
  DELETE FROM public.seller_tasks
   WHERE order_item_id = v_phase.order_item_id
     AND type = 'pay_supplier_advance'
     AND status = 'pendiente'
     AND reason LIKE '%[phase:' || v_phase.id::text || ']%';

  IF v_phase.supplier_id IS NULL THEN RETURN; END IF;
  IF v_phase.quotation_date IS NULL THEN RETURN; END IF;
  IF COALESCE(v_phase.ready_for_advance_payment, false) = false THEN RETURN; END IF;

  v_cost := COALESCE(v_phase.negotiated_cost, v_phase.manufacturing_cost);
  IF v_cost IS NULL OR v_cost <= 0 THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM public.order_item_supplier_payments
     WHERE phase_id = v_phase.id AND payment_type = 'advance'
  ) THEN
    RETURN;
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = v_phase.order_item_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = v_phase.order_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_supplier FROM public.suppliers WHERE id = v_phase.supplier_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF COALESCE(v_supplier.requires_advance_payment, false) = false THEN
    RETURN;
  END IF;

  v_pct := COALESCE(v_supplier.advance_payment_pct, 50);
  v_amount := round(v_cost * (v_pct / 100.0));
  v_invoice := COALESCE(v_order.invoice_number, v_order.order_number, '');
  v_desc := COALESCE(split_part(v_item.description, E'\n', 1), 'Producto');

  v_title := 'Pago a proveedor pendiente — ' || v_desc || ' · ' || v_phase.name;
  v_reason :=
    'Cotización aprobada — ' || v_desc || ' · Fase: ' || v_phase.name ||
    ' · Factura #' || v_invoice ||
    ' · Proveedor: ' || v_supplier.name ||
    ' · Valor a pagar (anticipo ' || round(v_pct)::text || '%): $' ||
    to_char(v_amount, 'FM999,999,999,990') ||
    '. Pendiente de pago al proveedor.' ||
    ' Cotización aprobada el ' ||
    to_char(v_phase.quotation_date, 'DD/MM/YYYY') || '.' ||
    ' [phase:' || v_phase.id::text || ']';

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

-- 4) BEFORE trigger: revert approval when quote-relevant fields change on a phase (unless already paid)
CREATE OR REPLACE FUNCTION public.trg_order_item_phases_quotation_approved_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_payment boolean;
  v_changed boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
       OR NEW.quotation_date IS DISTINCT FROM OLD.quotation_date
       OR NEW.negotiated_cost IS DISTINCT FROM OLD.negotiated_cost
       OR NEW.manufacturing_cost IS DISTINCT FROM OLD.manufacturing_cost THEN
      v_changed := true;
    END IF;

    IF v_changed THEN
      SELECT EXISTS (
        SELECT 1 FROM public.order_item_supplier_payments
         WHERE phase_id = NEW.id AND payment_type = 'advance'
      ) INTO v_has_payment;
      IF NOT v_has_payment
         AND COALESCE(NEW.ready_for_advance_payment, false) = true
         AND NEW.ready_for_advance_payment IS NOT DISTINCT FROM OLD.ready_for_advance_payment THEN
        NEW.ready_for_advance_payment := false;
        NEW.ready_for_advance_payment_at := NULL;
        NEW.ready_for_advance_payment_by := NULL;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_item_phases_quotation_approved ON public.order_item_phases;
CREATE TRIGGER trg_order_item_phases_quotation_approved
BEFORE UPDATE OF supplier_id, quotation_date, negotiated_cost, manufacturing_cost, ready_for_advance_payment
ON public.order_item_phases
FOR EACH ROW EXECUTE FUNCTION public.trg_order_item_phases_quotation_approved_fn();

-- 5) AFTER trigger: refresh phase task
CREATE OR REPLACE FUNCTION public.trg_order_item_phases_refresh_supplier_task_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_supplier_phase_payment_tasks(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_item_phases_refresh_supplier_task ON public.order_item_phases;
CREATE TRIGGER trg_order_item_phases_refresh_supplier_task
AFTER INSERT OR UPDATE OF supplier_id, quotation_date, negotiated_cost, manufacturing_cost, ready_for_advance_payment
ON public.order_item_phases
FOR EACH ROW EXECUTE FUNCTION public.trg_order_item_phases_refresh_supplier_task_fn();

-- 6) Cleanup: remove any phase-tagged pending tasks whose phase is not (or no longer) approved
DELETE FROM public.seller_tasks st
 WHERE st.type = 'pay_supplier_advance'
   AND st.status = 'pendiente'
   AND st.reason LIKE '%[phase:%]%'
   AND NOT EXISTS (
     SELECT 1 FROM public.order_item_phases ph
      WHERE '[phase:' || ph.id::text || ']' = substring(st.reason from '\[phase:[0-9a-f-]+\]')
        AND COALESCE(ph.ready_for_advance_payment, false) = true
   );
