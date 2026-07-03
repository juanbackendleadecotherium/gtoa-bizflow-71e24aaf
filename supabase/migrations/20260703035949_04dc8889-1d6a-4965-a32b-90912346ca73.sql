
-- 1) Function: create/refresh pending supplier-payment tasks for finance users
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

  -- guard: requires supplier + cost + quotation_date + no payment yet
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

  -- Refresh: delete any pending pay_supplier_advance tasks for this item so
  -- the text stays in sync when supplier/cost/date changes.
  DELETE FROM public.seller_tasks
   WHERE order_item_id = v_item.id
     AND type = 'pay_supplier_advance'
     AND status = 'pendiente';

  FOR v_finance_user IN
    SELECT user_id FROM public.user_roles WHERE role = 'finanzas'
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

GRANT EXECUTE ON FUNCTION public.create_supplier_payment_tasks(uuid) TO authenticated;

-- 2) Trigger on order_items: fire on quotation approval
CREATE OR REPLACE FUNCTION public.trg_order_items_quotation_approved_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.supplier_id IS NULL OR NEW.quotation_date IS NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.negotiated_cost, NEW.manufacturing_cost) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only fire when a relevant field became set or changed.
  IF TG_OP = 'UPDATE'
     AND NEW.supplier_id IS NOT DISTINCT FROM OLD.supplier_id
     AND NEW.quotation_date IS NOT DISTINCT FROM OLD.quotation_date
     AND NEW.negotiated_cost IS NOT DISTINCT FROM OLD.negotiated_cost
     AND NEW.manufacturing_cost IS NOT DISTINCT FROM OLD.manufacturing_cost THEN
    RETURN NEW;
  END IF;

  PERFORM public.create_supplier_payment_tasks(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_quotation_approved ON public.order_items;
CREATE TRIGGER trg_order_items_quotation_approved
AFTER INSERT OR UPDATE OF supplier_id, quotation_date, negotiated_cost, manufacturing_cost
ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.trg_order_items_quotation_approved_fn();

-- 3) Trigger on order_item_supplier_payments (advance): notify production creator
CREATE OR REPLACE FUNCTION public.trg_on_supplier_advance_paid_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid;
  v_po_code text;
  v_desc text;
  v_invoice text;
  v_title text;
  v_reason text;
BEGIN
  IF COALESCE(NEW.payment_type, 'advance') <> 'advance' THEN
    RETURN NEW;
  END IF;

  -- Close pending finance tasks for this item
  UPDATE public.seller_tasks
     SET status = 'resuelta', resolved_at = now(), updated_at = now()
   WHERE order_item_id = NEW.order_item_id
     AND type = 'pay_supplier_advance'
     AND status = 'pendiente';

  IF NEW.production_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT created_by, code
    INTO v_creator, v_po_code
    FROM public.production_orders
    WHERE id = NEW.production_order_id;
  IF v_creator IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(split_part(oi.description, E'\n', 1), 'Producto'),
         COALESCE(o.invoice_number, o.order_number, '')
    INTO v_desc, v_invoice
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
   WHERE oi.id = NEW.order_item_id;

  v_title := 'Pago a proveedor confirmado — puedes iniciar fabricación';
  v_reason :=
    'El pago al proveedor ' || COALESCE(NEW.supplier_name_snapshot, '') ||
    ' fue realizado el ' || to_char(NEW.paid_at, 'DD/MM/YYYY') ||
    '. Puedes iniciar fabricación desde esta fecha. Producto: ' || v_desc ||
    ' · Factura #' || v_invoice ||
    CASE WHEN v_po_code IS NOT NULL THEN ' · OP ' || v_po_code ELSE '' END || '.';

  INSERT INTO public.seller_tasks(
    seller_id, order_id, production_order_id, order_item_id, brand_id,
    type, title, reason, severity, status
  ) VALUES (
    v_creator, NEW.order_id, NEW.production_order_id, NEW.order_item_id, NEW.brand_id,
    'supplier_advance_paid', v_title, v_reason, 'info', 'pendiente'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_supplier_advance_paid ON public.order_item_supplier_payments;
CREATE TRIGGER trg_on_supplier_advance_paid
AFTER INSERT ON public.order_item_supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_on_supplier_advance_paid_fn();

-- 4) Restrict insert on order_item_supplier_payments to admin or finanzas
DROP POLICY IF EXISTS "oisp insert by brand writer" ON public.order_item_supplier_payments;
DROP POLICY IF EXISTS "oisp insert by finance" ON public.order_item_supplier_payments;
CREATE POLICY "oisp insert by finance"
ON public.order_item_supplier_payments
FOR INSERT
TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finanzas'))
  AND EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id = order_item_supplier_payments.supplier_id
      AND s.brand_id = order_item_supplier_payments.brand_id
  )
  AND EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.id = order_item_supplier_payments.order_item_id
      AND oi.order_id = order_item_supplier_payments.order_id
  )
);
