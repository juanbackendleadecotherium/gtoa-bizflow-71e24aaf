
-- ============================================================
-- SALES GOALS + COMMISSIONS
-- ============================================================

-- 1. sales_goals ---------------------------------------------
CREATE TABLE public.sales_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  seller_id uuid NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique per (brand, seller-or-NULL, month). Two partial unique indexes to
-- treat NULL seller as "brand-global".
CREATE UNIQUE INDEX sales_goals_brand_month_global_uidx
  ON public.sales_goals (brand_id, period_month)
  WHERE seller_id IS NULL;
CREATE UNIQUE INDEX sales_goals_brand_seller_month_uidx
  ON public.sales_goals (brand_id, seller_id, period_month)
  WHERE seller_id IS NOT NULL;

-- Force period_month to be the first day of the month
CREATE OR REPLACE FUNCTION public.sales_goals_normalize_month()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.period_month := date_trunc('month', NEW.period_month)::date;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER sales_goals_normalize_month
  BEFORE INSERT OR UPDATE ON public.sales_goals
  FOR EACH ROW EXECUTE FUNCTION public.sales_goals_normalize_month();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_goals TO authenticated;
GRANT ALL ON public.sales_goals TO service_role;
ALTER TABLE public.sales_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all sales goals" ON public.sales_goals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users read own or brand goals" ON public.sales_goals
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR seller_id = auth.uid()
    OR (seller_id IS NULL AND public.has_brand_access(auth.uid(), brand_id))
  );

-- 2. commission_tiers ----------------------------------------
CREATE TABLE public.commission_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NULL REFERENCES public.brands(id) ON DELETE CASCADE, -- NULL = aplica a todas
  min_amount numeric(14,2) NOT NULL CHECK (min_amount >= 0),
  max_amount numeric(14,2) NULL CHECK (max_amount IS NULL OR max_amount > min_amount),
  percentage numeric(5,2) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_tiers TO authenticated;
GRANT ALL ON public.commission_tiers TO service_role;
ALTER TABLE public.commission_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can read tiers" ON public.commission_tiers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage tiers" ON public.commission_tiers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed default global tiers
INSERT INTO public.commission_tiers (brand_id, min_amount, max_amount, percentage, sort_order)
VALUES
  (NULL, 0,           80000000,   2.0, 1),
  (NULL, 80000001,    99999999,   2.5, 2),
  (NULL, 100000000,   149999999,  3.0, 3),
  (NULL, 150000000,   NULL,       3.5, 4);

-- 3. commission_requests -------------------------------------
CREATE TABLE public.commission_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL,
  seller_label text NULL,
  period_month date NOT NULL,
  sale_amount numeric(14,2) NOT NULL,
  seller_monthly_sales numeric(14,2) NOT NULL,
  tier_percentage numeric(5,2) NOT NULL,
  commission_amount numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente','aprobada','rechazada','pagada','revertida')),
  rejection_reason text NULL,
  approved_by uuid NULL,
  approved_at timestamptz NULL,
  paid_by uuid NULL,
  paid_at timestamptz NULL,
  paid_reference text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);
CREATE INDEX commission_requests_status_idx ON public.commission_requests(status);
CREATE INDEX commission_requests_seller_idx ON public.commission_requests(seller_id, period_month);

CREATE TRIGGER commission_requests_touch
  BEFORE UPDATE ON public.commission_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_requests TO authenticated;
GRANT ALL ON public.commission_requests TO service_role;
ALTER TABLE public.commission_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers read own commissions" ON public.commission_requests
  FOR SELECT TO authenticated
  USING (
    seller_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'finanzas')
  );
CREATE POLICY "Admins manage commissions" ON public.commission_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Finanzas update commissions" ON public.commission_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'finanzas'))
  WITH CHECK (public.has_role(auth.uid(), 'finanzas'));

-- 4. Helper: calculate applicable tier -----------------------
CREATE OR REPLACE FUNCTION public.commission_tier_for(_brand_id uuid, _amount numeric)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT percentage FROM public.commission_tiers
   WHERE is_active
     AND (brand_id = _brand_id OR brand_id IS NULL)
     AND _amount >= min_amount
     AND (max_amount IS NULL OR _amount <= max_amount)
   ORDER BY brand_id NULLS LAST, min_amount DESC
   LIMIT 1;
$$;

-- 5. Trigger: create commission_request when order is fully paid
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
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id;
  IF NOT FOUND OR v_order.seller_id IS NULL OR v_order.total IS NULL OR v_order.total <= 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.order_payments WHERE order_id = _order_id;
  -- Include advance amount if tracked separately
  v_paid := v_paid + COALESCE(v_order.advance_amount, 0);

  IF v_paid < v_order.total THEN RETURN; END IF;

  -- Already exists?
  IF EXISTS (SELECT 1 FROM public.commission_requests WHERE order_id = _order_id) THEN
    RETURN;
  END IF;

  v_seller := v_order.seller_id;
  v_period := date_trunc('month', COALESCE(v_order.sale_date, v_order.created_at::date))::date;

  SELECT display_name INTO v_seller_label FROM public.profiles WHERE user_id = v_seller LIMIT 1;
  IF v_seller_label IS NULL THEN
    SELECT email INTO v_seller_label FROM public.profiles WHERE user_id = v_seller LIMIT 1;
  END IF;

  -- Total ventas del mes del vendedor en esa marca (incluyendo esta)
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
  );

  -- Notify admin (Luisa / gerencia)
  INSERT INTO public.seller_tasks(seller_id, order_id, brand_id, type, title, reason, severity, status)
  SELECT ur.user_id, _order_id, v_order.brand_id, 'commission_approval',
         'Comisión pendiente de aprobación',
         'Vendedor ' || COALESCE(v_seller_label, '—') ||
           ' · Venta ' || COALESCE(v_order.invoice_number, v_order.order_number, '—') ||
           ' · Comisión $' || to_char(v_comm, 'FM999,999,999,990'),
         'warning', 'pendiente'
    FROM public.user_roles ur
   WHERE ur.role = 'admin';
END $$;

CREATE OR REPLACE FUNCTION public.trg_order_payments_commission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM public.maybe_create_commission_request(NEW.order_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS order_payments_commission_check ON public.order_payments;
CREATE TRIGGER order_payments_commission_check
  AFTER INSERT OR UPDATE ON public.order_payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_order_payments_commission();

-- 6. Approve / reject / pay RPCs -----------------------------
CREATE OR REPLACE FUNCTION public.approve_commission(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.commission_requests%ROWTYPE;
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

  UPDATE public.seller_tasks
     SET status = 'resuelta', resolved_at = now(), updated_at = now()
   WHERE order_id = v_row.order_id
     AND type = 'commission_approval'
     AND status = 'pendiente';

  INSERT INTO public.seller_tasks(seller_id, order_id, brand_id, type, title, reason, severity, status)
  VALUES (v_row.seller_id, v_row.order_id, v_row.brand_id, 'commission_approved',
    'Comisión aprobada',
    'Tu comisión de $' || to_char(v_row.commission_amount, 'FM999,999,999,990') ||
      ' fue aprobada. Queda pendiente de pago por finanzas.',
    'info', 'pendiente');
END $$;

CREATE OR REPLACE FUNCTION public.reject_commission(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.commission_requests%ROWTYPE;
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

  UPDATE public.seller_tasks
     SET status = 'resuelta', resolved_at = now(), updated_at = now()
   WHERE order_id = v_row.order_id
     AND type = 'commission_approval'
     AND status = 'pendiente';

  INSERT INTO public.seller_tasks(seller_id, order_id, brand_id, type, title, reason, severity, status)
  VALUES (v_row.seller_id, v_row.order_id, v_row.brand_id, 'commission_rejected',
    'Comisión rechazada',
    'Motivo: ' || btrim(_reason), 'error', 'pendiente');
END $$;

CREATE OR REPLACE FUNCTION public.pay_commission(_id uuid, _reference text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.commission_requests%ROWTYPE;
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

  INSERT INTO public.seller_tasks(seller_id, order_id, brand_id, type, title, reason, severity, status)
  VALUES (v_row.seller_id, v_row.order_id, v_row.brand_id, 'commission_paid',
    'Comisión pagada',
    'Se registró el pago de tu comisión ($' || to_char(v_row.commission_amount, 'FM999,999,999,990') || ').',
    'info', 'pendiente');
END $$;

-- 7. Backfill: check existing fully-paid orders --------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.orders WHERE seller_id IS NOT NULL LOOP
    PERFORM public.maybe_create_commission_request(r.id);
  END LOOP;
END $$;
