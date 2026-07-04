
-- =========================================================================
-- Commission audit log + bulk pay + finance notifications
-- =========================================================================

CREATE TABLE public.commission_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_request_id uuid NOT NULL REFERENCES public.commission_requests(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('created','approved','rejected','paid','reverted')),
  actor_id uuid NULL,
  actor_label text NULL,
  reason text NULL,
  reference text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commission_audit_log_req_idx
  ON public.commission_audit_log(commission_request_id, created_at DESC);

GRANT SELECT ON public.commission_audit_log TO authenticated;
GRANT ALL ON public.commission_audit_log TO service_role;
ALTER TABLE public.commission_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own or privileged audit"
  ON public.commission_audit_log FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'finanzas')
    OR EXISTS (
      SELECT 1 FROM public.commission_requests cr
       WHERE cr.id = commission_request_id
         AND cr.seller_id = auth.uid()
    )
  );

-- Helper: nombre visible del actor
CREATE OR REPLACE FUNCTION public.commission_actor_label(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(display_name, email) FROM public.profiles WHERE user_id = _uid LIMIT 1;
$$;

-- =========================================================================
-- Recreate: maybe_create_commission_request (audit + finanzas notice)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.maybe_create_commission_request(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_paid numeric;
  v_seller uuid;
  v_seller_label text;
  v_period date;
  v_monthly numeric;
  v_pct numeric;
  v_comm numeric;
  v_new_id uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id;
  IF NOT FOUND OR v_order.seller_id IS NULL OR v_order.total IS NULL OR v_order.total <= 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.order_payments WHERE order_id = _order_id;
  v_paid := v_paid + COALESCE(v_order.advance_amount, 0);

  IF v_paid < v_order.total THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.commission_requests WHERE order_id = _order_id) THEN RETURN; END IF;

  v_seller := v_order.seller_id;
  v_period := date_trunc('month', COALESCE(v_order.sale_date, v_order.created_at::date))::date;
  v_seller_label := public.commission_actor_label(v_seller);

  SELECT COALESCE(SUM(total), 0) INTO v_monthly
    FROM public.orders
   WHERE seller_id = v_seller
     AND brand_id = v_order.brand_id
     AND date_trunc('month', COALESCE(sale_date, created_at::date))::date = v_period;

  v_pct := public.commission_tier_for(v_order.brand_id, v_monthly);
  IF v_pct IS NULL THEN v_pct := 0; END IF;
  v_comm := round(v_order.total * v_pct / 100.0, 2);

  INSERT INTO public.commission_requests(
    order_id, brand_id, seller_id, seller_label, period_month,
    sale_amount, seller_monthly_sales, tier_percentage, commission_amount, status
  ) VALUES (
    _order_id, v_order.brand_id, v_seller, v_seller_label, v_period,
    v_order.total, v_monthly, v_pct, v_comm, 'pendiente'
  ) RETURNING id INTO v_new_id;

  INSERT INTO public.commission_audit_log(commission_request_id, action, actor_label, metadata)
  VALUES (v_new_id, 'created', 'Sistema',
          jsonb_build_object('sale_amount', v_order.total, 'tier_percentage', v_pct, 'commission_amount', v_comm));

  -- Notify admin (Luisa)
  INSERT INTO public.seller_tasks(seller_id, order_id, brand_id, type, title, reason, severity, status)
  SELECT ur.user_id, _order_id, v_order.brand_id, 'commission_approval',
         'Comisión pendiente de aprobación',
         'Vendedor ' || COALESCE(v_seller_label, '—') ||
           ' · Venta ' || COALESCE(v_order.invoice_number, v_order.order_number, '—') ||
           ' · Comisión $' || to_char(v_comm, 'FM999,999,999,990'),
         'warning', 'pendiente'
    FROM public.user_roles ur
   WHERE ur.role = 'admin';

  -- Notify finanzas as informative
  INSERT INTO public.seller_tasks(seller_id, order_id, brand_id, type, title, reason, severity, status)
  SELECT ur.user_id, _order_id, v_order.brand_id, 'commission_new',
         'Nueva comisión generada',
         'Vendedor ' || COALESCE(v_seller_label, '—') ||
           ' · Comisión $' || to_char(v_comm, 'FM999,999,999,990') ||
           ' pendiente de aprobación por gerencia.',
         'info', 'pendiente'
    FROM public.user_roles ur
   WHERE ur.role = 'finanzas';
END $$;

-- =========================================================================
-- Recreate: approve_commission (audit + finanzas notice)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.approve_commission(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.commission_requests%ROWTYPE;
  v_label text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Solo administradores pueden aprobar comisiones';
  END IF;
  SELECT * INTO v_row FROM public.commission_requests WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comisión no encontrada'; END IF;
  IF v_row.status <> 'pendiente' THEN
    RAISE EXCEPTION 'Solo se aprueban comisiones pendientes';
  END IF;

  UPDATE public.commission_requests
     SET status = 'aprobada', approved_by = v_uid, approved_at = now()
   WHERE id = _id;

  v_label := public.commission_actor_label(v_uid);

  INSERT INTO public.commission_audit_log(commission_request_id, action, actor_id, actor_label)
  VALUES (_id, 'approved', v_uid, v_label);

  UPDATE public.seller_tasks
     SET status = 'resuelta', resolved_at = now(), updated_at = now()
   WHERE order_id = v_row.order_id
     AND type IN ('commission_approval','commission_new')
     AND status = 'pendiente';

  -- Vendedor
  INSERT INTO public.seller_tasks(seller_id, order_id, brand_id, type, title, reason, severity, status)
  VALUES (v_row.seller_id, v_row.order_id, v_row.brand_id, 'commission_approved',
    'Comisión aprobada',
    'Tu comisión de $' || to_char(v_row.commission_amount, 'FM999,999,999,990') ||
      ' fue aprobada por ' || COALESCE(v_label, 'gerencia') || '. Queda pendiente de pago.',
    'info', 'pendiente');

  -- Finanzas: acción de pago
  INSERT INTO public.seller_tasks(seller_id, order_id, brand_id, type, title, reason, severity, status)
  SELECT ur.user_id, v_row.order_id, v_row.brand_id, 'commission_ready_to_pay',
         'Comisión aprobada lista para pagar',
         'Vendedor ' || COALESCE(v_row.seller_label, '—') ||
           ' · Comisión $' || to_char(v_row.commission_amount, 'FM999,999,999,990'),
         'warning', 'pendiente'
    FROM public.user_roles ur
   WHERE ur.role IN ('finanzas','admin');
END $$;

-- =========================================================================
-- Recreate: reject_commission (audit + notice)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.reject_commission(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.commission_requests%ROWTYPE;
  v_label text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Solo administradores pueden rechazar comisiones';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN
    RAISE EXCEPTION 'Indica un motivo de rechazo';
  END IF;
  SELECT * INTO v_row FROM public.commission_requests WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comisión no encontrada'; END IF;
  IF v_row.status <> 'pendiente' THEN
    RAISE EXCEPTION 'Solo se rechazan comisiones pendientes';
  END IF;

  UPDATE public.commission_requests
     SET status = 'rechazada', approved_by = v_uid, approved_at = now(),
         rejection_reason = btrim(_reason)
   WHERE id = _id;

  v_label := public.commission_actor_label(v_uid);

  INSERT INTO public.commission_audit_log(commission_request_id, action, actor_id, actor_label, reason)
  VALUES (_id, 'rejected', v_uid, v_label, btrim(_reason));

  UPDATE public.seller_tasks
     SET status = 'resuelta', resolved_at = now(), updated_at = now()
   WHERE order_id = v_row.order_id
     AND type IN ('commission_approval','commission_new')
     AND status = 'pendiente';

  -- Vendedor
  INSERT INTO public.seller_tasks(seller_id, order_id, brand_id, type, title, reason, severity, status)
  VALUES (v_row.seller_id, v_row.order_id, v_row.brand_id, 'commission_rejected',
    'Comisión rechazada',
    'Rechazada por ' || COALESCE(v_label, 'gerencia') || '. Motivo: ' || btrim(_reason),
    'error', 'pendiente');

  -- Finanzas informativa
  INSERT INTO public.seller_tasks(seller_id, order_id, brand_id, type, title, reason, severity, status)
  SELECT ur.user_id, v_row.order_id, v_row.brand_id, 'commission_rejected_notice',
         'Comisión rechazada por gerencia',
         'Vendedor ' || COALESCE(v_row.seller_label, '—') ||
           ' · Motivo: ' || btrim(_reason),
         'info', 'pendiente'
    FROM public.user_roles ur
   WHERE ur.role = 'finanzas';
END $$;

-- =========================================================================
-- Recreate: pay_commission (audit + close finanzas task)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.pay_commission(_id uuid, _reference text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.commission_requests%ROWTYPE;
  v_label text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'finanzas')) THEN
    RAISE EXCEPTION 'Solo finanzas o admin pueden marcar la comisión como pagada';
  END IF;
  SELECT * INTO v_row FROM public.commission_requests WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comisión no encontrada'; END IF;
  IF v_row.status <> 'aprobada' THEN
    RAISE EXCEPTION 'Solo se pagan comisiones aprobadas';
  END IF;

  UPDATE public.commission_requests
     SET status = 'pagada', paid_by = v_uid, paid_at = now(), paid_reference = _reference
   WHERE id = _id;

  v_label := public.commission_actor_label(v_uid);

  INSERT INTO public.commission_audit_log(commission_request_id, action, actor_id, actor_label, reference)
  VALUES (_id, 'paid', v_uid, v_label, _reference);

  UPDATE public.seller_tasks
     SET status = 'resuelta', resolved_at = now(), updated_at = now()
   WHERE order_id = v_row.order_id
     AND type = 'commission_ready_to_pay'
     AND status = 'pendiente';

  INSERT INTO public.seller_tasks(seller_id, order_id, brand_id, type, title, reason, severity, status)
  VALUES (v_row.seller_id, v_row.order_id, v_row.brand_id, 'commission_paid',
    'Comisión pagada',
    'Se registró el pago de tu comisión ($' || to_char(v_row.commission_amount, 'FM999,999,999,990') || ')' ||
      CASE WHEN _reference IS NOT NULL AND length(btrim(_reference)) > 0
           THEN ' · Ref: ' || _reference ELSE '' END || '.',
    'info', 'pendiente');
END $$;

-- =========================================================================
-- Bulk pay
-- =========================================================================
CREATE OR REPLACE FUNCTION public.pay_commissions_bulk(_ids uuid[], _reference text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_count int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'finanzas')) THEN
    RAISE EXCEPTION 'Solo finanzas o admin pueden pagar comisiones';
  END IF;

  FOREACH v_id IN ARRAY _ids LOOP
    BEGIN
      PERFORM public.pay_commission(v_id, _reference);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- omit failing ones (already paid, not approved, etc.)
      NULL;
    END;
  END LOOP;

  RETURN v_count;
END $$;

-- =========================================================================
-- Get audit log for a commission
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_commission_audit(_id uuid)
RETURNS TABLE (
  id uuid,
  action text,
  actor_label text,
  reason text,
  reference text,
  created_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, action, actor_label, reason, reference, created_at
    FROM public.commission_audit_log
   WHERE commission_request_id = _id
   ORDER BY created_at ASC;
$$;

-- Backfill: add 'created' audit rows for existing commissions that don't have one
INSERT INTO public.commission_audit_log(commission_request_id, action, actor_label, created_at, metadata)
SELECT cr.id, 'created', 'Sistema', cr.created_at,
       jsonb_build_object('sale_amount', cr.sale_amount, 'tier_percentage', cr.tier_percentage, 'commission_amount', cr.commission_amount)
  FROM public.commission_requests cr
 WHERE NOT EXISTS (
   SELECT 1 FROM public.commission_audit_log al
    WHERE al.commission_request_id = cr.id AND al.action = 'created'
 );

-- Also backfill for already approved/rejected/paid
INSERT INTO public.commission_audit_log(commission_request_id, action, actor_id, actor_label, reason, created_at)
SELECT cr.id, 'approved', cr.approved_by, public.commission_actor_label(cr.approved_by), NULL, cr.approved_at
  FROM public.commission_requests cr
 WHERE cr.status IN ('aprobada','pagada') AND cr.approved_at IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.commission_audit_log al WHERE al.commission_request_id = cr.id AND al.action = 'approved');

INSERT INTO public.commission_audit_log(commission_request_id, action, actor_id, actor_label, reason, created_at)
SELECT cr.id, 'rejected', cr.approved_by, public.commission_actor_label(cr.approved_by), cr.rejection_reason, cr.approved_at
  FROM public.commission_requests cr
 WHERE cr.status = 'rechazada' AND cr.approved_at IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.commission_audit_log al WHERE al.commission_request_id = cr.id AND al.action = 'rejected');

INSERT INTO public.commission_audit_log(commission_request_id, action, actor_id, actor_label, reference, created_at)
SELECT cr.id, 'paid', cr.paid_by, public.commission_actor_label(cr.paid_by), cr.paid_reference, cr.paid_at
  FROM public.commission_requests cr
 WHERE cr.status = 'pagada' AND cr.paid_at IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.commission_audit_log al WHERE al.commission_request_id = cr.id AND al.action = 'paid');
