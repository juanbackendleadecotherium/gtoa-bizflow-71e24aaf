
-- 1) payment_type column for advance vs final
ALTER TABLE public.order_item_supplier_payments
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'advance'
  CHECK (payment_type IN ('advance','final'));

-- Drop the implicit "single payment per item" unique constraint if it exists,
-- so we can store both the advance and the final payment.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.order_item_supplier_payments'::regclass
       AND contype = 'u'
  LOOP
    -- Drop unique constraints only on order_item_id alone
    IF EXISTS (
      SELECT 1 FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
       WHERE c.conname = r.conname
         AND a.attname = 'order_item_id'
       GROUP BY c.conname
       HAVING count(*) = 1
    ) THEN
      EXECUTE format('ALTER TABLE public.order_item_supplier_payments DROP CONSTRAINT %I', r.conname);
    END IF;
  END LOOP;
END $$;

-- Replace any unique index on order_item_id alone with a partial one for advance only
DROP INDEX IF EXISTS public.order_item_supplier_payments_order_item_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS order_item_supplier_payments_advance_unique
  ON public.order_item_supplier_payments(order_item_id)
  WHERE payment_type = 'advance';
CREATE UNIQUE INDEX IF NOT EXISTS order_item_supplier_payments_final_unique
  ON public.order_item_supplier_payments(order_item_id)
  WHERE payment_type = 'final';

-- 2) Notification: when item is finished, notify seller and create
--    "confirm_supplier_final_payment" tasks for admins + advance recorder.
CREATE OR REPLACE FUNCTION public.notify_on_item_finished()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
  v_advance public.order_item_supplier_payments%ROWTYPE;
  v_final_exists boolean;
  v_line numeric;
  v_total_cost numeric;
  v_paid numeric;
  v_remaining numeric;
  v_short_desc text;
  v_admin record;
  v_reason text;
  v_invoice_label text;
BEGIN
  -- Only when finished transitions from NULL → not null
  IF NEW.production_finished_at IS NULL OR OLD.production_finished_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;
  v_short_desc := COALESCE(split_part(NEW.description, E'\n', 1), 'Producto');
  v_invoice_label := CASE
    WHEN v_order.invoice_number IS NOT NULL THEN 'Fact. ' || v_order.invoice_number
    WHEN v_order.order_number IS NOT NULL THEN v_order.order_number
    ELSE ''
  END;

  -- A) Notificar al vendedor (informativo, único)
  IF v_order.seller_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.seller_tasks
        WHERE order_item_id = NEW.id
          AND type = 'item_finished_notify'
     ) THEN
    INSERT INTO public.seller_tasks(
      seller_id, order_id, production_order_id, order_item_id, brand_id,
      type, title, reason, severity, status
    ) VALUES (
      v_order.seller_id, v_order.id, NEW.production_order_id, NEW.id, v_order.brand_id,
      'item_finished_notify',
      'Tu producto ya está terminado',
      'Producción terminó: ' || v_short_desc ||
        CASE WHEN v_invoice_label <> '' THEN ' · ' || v_invoice_label ELSE '' END ||
        '. Puedes informar al cliente.',
      'info', 'pendiente'
    );
  END IF;

  -- B) Tarea de pago final al proveedor (si aplica)
  IF NEW.supplier_id IS NOT NULL THEN
    SELECT * INTO v_supplier FROM public.suppliers WHERE id = NEW.supplier_id;

    SELECT * INTO v_advance
      FROM public.order_item_supplier_payments
     WHERE order_item_id = NEW.id AND payment_type = 'advance'
     ORDER BY created_at ASC LIMIT 1;

    SELECT EXISTS (
      SELECT 1 FROM public.order_item_supplier_payments
       WHERE order_item_id = NEW.id AND payment_type = 'final'
    ) INTO v_final_exists;

    -- Only create the task if there is a known cost and final not yet paid
    v_line := COALESCE(NEW.quantity, 0) * COALESCE(NEW.unit_price, 0);
    v_total_cost := COALESCE(NEW.negotiated_cost, NEW.manufacturing_cost);
    v_paid := COALESCE(v_advance.amount, 0);
    v_remaining := COALESCE(v_total_cost, 0) - v_paid;

    IF v_total_cost IS NOT NULL AND v_total_cost > 0 AND v_remaining > 0 AND NOT v_final_exists THEN
      v_reason :=
        'Producto: ' || v_short_desc ||
        E'\nProveedor: ' || COALESCE(v_supplier.name, 'sin proveedor') ||
        CASE WHEN v_invoice_label <> '' THEN E'\nFactura: ' || v_invoice_label ELSE '' END ||
        E'\nCosto total acordado: $' || to_char(v_total_cost, 'FM999,999,999,990') ||
        E'\nAnticipo registrado: $' || to_char(v_paid, 'FM999,999,999,990') ||
        E'\nSaldo por pagar: $' || to_char(v_remaining, 'FM999,999,999,990') ||
        E'\n\n¿Ya realizaste el pago restante al proveedor?';

      -- Para cada admin
      FOR v_admin IN
        SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'admin'
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM public.seller_tasks
           WHERE order_item_id = NEW.id
             AND type = 'confirm_supplier_final_payment'
             AND seller_id = v_admin.user_id
        ) THEN
          INSERT INTO public.seller_tasks(
            seller_id, order_id, production_order_id, order_item_id, brand_id,
            type, title, reason, severity, status
          ) VALUES (
            v_admin.user_id, v_order.id, NEW.production_order_id, NEW.id, v_order.brand_id,
            'confirm_supplier_final_payment',
            'Pago restante al proveedor — ' || COALESCE(v_supplier.name, 'proveedor'),
            v_reason, 'warning', 'pendiente'
          );
        END IF;
      END LOOP;

      -- También quien registró el anticipo, si no es admin
      IF v_advance.created_by IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.seller_tasks
           WHERE order_item_id = NEW.id
             AND type = 'confirm_supplier_final_payment'
             AND seller_id = v_advance.created_by
        ) THEN
          INSERT INTO public.seller_tasks(
            seller_id, order_id, production_order_id, order_item_id, brand_id,
            type, title, reason, severity, status
          ) VALUES (
            v_advance.created_by, v_order.id, NEW.production_order_id, NEW.id, v_order.brand_id,
            'confirm_supplier_final_payment',
            'Pago restante al proveedor — ' || COALESCE(v_supplier.name, 'proveedor'),
            v_reason, 'warning', 'pendiente'
          );
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_item_finished ON public.order_items;
CREATE TRIGGER trg_notify_on_item_finished
AFTER UPDATE OF production_finished_at ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_item_finished();

-- 3) RPC to confirm the final supplier payment from the task
CREATE OR REPLACE FUNCTION public.confirm_supplier_final_payment(
  _item_id uuid,
  _amount numeric,
  _paid_at date DEFAULT current_date,
  _reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_item public.order_items%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
  v_advance public.order_item_supplier_payments%ROWTYPE;
  v_pid uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Indica el monto pagado';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = _item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
  IF v_item.supplier_id IS NULL THEN RAISE EXCEPTION 'El producto no tiene proveedor'; END IF;

  -- Allow admins or quien registró el anticipo
  IF NOT public.has_role(v_uid, 'admin') THEN
    SELECT * INTO v_advance FROM public.order_item_supplier_payments
      WHERE order_item_id = _item_id AND payment_type = 'advance' LIMIT 1;
    IF v_advance.created_by IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'No autorizado';
    END IF;
  ELSE
    SELECT * INTO v_advance FROM public.order_item_supplier_payments
      WHERE order_item_id = _item_id AND payment_type = 'advance' LIMIT 1;
  END IF;

  SELECT * INTO v_supplier FROM public.suppliers WHERE id = v_item.supplier_id;
  SELECT email INTO v_email FROM public.profiles WHERE user_id = v_uid LIMIT 1;

  INSERT INTO public.order_item_supplier_payments(
    order_item_id, production_order_id, order_id, brand_id,
    supplier_id, supplier_name_snapshot, amount, paid_at,
    payment_type, created_by, created_by_email
  ) VALUES (
    v_item.id, v_item.production_order_id, v_item.order_id,
    (SELECT brand_id FROM public.orders WHERE id = v_item.order_id),
    v_supplier.id, v_supplier.name, _amount, _paid_at,
    'final', v_uid, v_email
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_pid;

  -- Resolve all matching pending tasks
  UPDATE public.seller_tasks
     SET status = 'resuelta', resolved_at = now(), updated_at = now()
   WHERE order_item_id = _item_id
     AND type = 'confirm_supplier_final_payment'
     AND status = 'pendiente';

  RETURN v_pid;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_supplier_final_payment(uuid, numeric, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_supplier_final_payment(uuid, numeric, date, text) TO authenticated;

-- 4) Bulk availability upsert (logistics)
CREATE OR REPLACE FUNCTION public.set_logistics_availability_bulk(
  _dates date[],
  _available boolean,
  _note text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'logistica')) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF _dates IS NULL OR array_length(_dates, 1) IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.logistics_availability(date, available, note, updated_by, updated_at)
  SELECT d, _available, NULLIF(btrim(COALESCE(_note,'')), ''), v_uid, now()
    FROM unnest(_dates) AS d
  ON CONFLICT (date) DO UPDATE
    SET available = EXCLUDED.available,
        note = EXCLUDED.note,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_logistics_availability_bulk(date[], boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_logistics_availability_bulk(date[], boolean, text) TO authenticated;
