
-- ============================================
-- 1) DEFERRED DELIVERY
-- ============================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS scheduled_delivery_date date,
  ADD COLUMN IF NOT EXISTS is_deferred_delivery boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deferred_reason text,
  ADD COLUMN IF NOT EXISTS deferred_at timestamptz,
  ADD COLUMN IF NOT EXISTS deferred_by uuid;

-- Backfill scheduled_delivery_date with the currently promised date
UPDATE public.orders
   SET scheduled_delivery_date = estimated_delivery_date
 WHERE scheduled_delivery_date IS NULL
   AND estimated_delivery_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.order_delivery_deferrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL,
  previous_date date,
  new_date date NOT NULL,
  reason text NOT NULL,
  created_by uuid,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_delivery_deferrals_order ON public.order_delivery_deferrals(order_id, created_at DESC);

GRANT SELECT, INSERT ON public.order_delivery_deferrals TO authenticated;
GRANT ALL ON public.order_delivery_deferrals TO service_role;

ALTER TABLE public.order_delivery_deferrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deferrals_admin_finance_read" ON public.order_delivery_deferrals;
CREATE POLICY "deferrals_admin_finance_read"
  ON public.order_delivery_deferrals FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'finanzas')
    OR EXISTS (
      SELECT 1 FROM public.orders o
       WHERE o.id = order_delivery_deferrals.order_id
         AND o.seller_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "deferrals_brand_write" ON public.order_delivery_deferrals;
CREATE POLICY "deferrals_brand_write"
  ON public.order_delivery_deferrals FOR INSERT TO authenticated
  WITH CHECK (public.can_write_brand(auth.uid(), brand_id));

-- Function: defer order delivery
CREATE OR REPLACE FUNCTION public.defer_order_delivery(
  p_order_id uuid,
  p_new_date date,
  p_reason text
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_order public.orders%ROWTYPE;
  v_prev date;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF p_new_date IS NULL THEN RAISE EXCEPTION 'Debes indicar la nueva fecha'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'El motivo debe tener al menos 5 caracteres';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada'; END IF;
  IF NOT public.can_write_brand(v_uid, v_order.brand_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  v_prev := COALESCE(v_order.scheduled_delivery_date, v_order.estimated_delivery_date);
  SELECT email INTO v_email FROM public.profiles WHERE user_id = v_uid LIMIT 1;

  UPDATE public.orders
     SET scheduled_delivery_date = p_new_date,
         is_deferred_delivery = true,
         deferred_reason = btrim(p_reason),
         deferred_at = now(),
         deferred_by = v_uid
   WHERE id = p_order_id;

  INSERT INTO public.order_delivery_deferrals(
    order_id, brand_id, previous_date, new_date, reason, created_by, created_by_email
  ) VALUES (
    p_order_id, v_order.brand_id, v_prev, p_new_date, btrim(p_reason), v_uid, v_email
  );

  -- Notify logistics / admins via seller_tasks (informative)
  INSERT INTO public.seller_tasks(
    seller_id, order_id, brand_id, type, title, reason, severity, status
  )
  SELECT ur.user_id, p_order_id, v_order.brand_id, 'delivery_deferred',
         'Entrega aplazada: ' || COALESCE(v_order.invoice_number, v_order.order_number),
         'Nueva fecha ' || to_char(p_new_date, 'DD/MM/YYYY') || ' — ' || btrim(p_reason),
         'info', 'pendiente'
    FROM public.user_roles ur
   WHERE ur.role IN ('admin', 'operativo', 'finanzas')
   ON CONFLICT DO NOTHING;
END;
$$;

-- ============================================
-- 2) ELECTRONIC INVOICE (Siigo bridge)
-- ============================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS electronic_invoice_status text NOT NULL DEFAULT 'no_facturada',
  ADD COLUMN IF NOT EXISTS electronic_invoice_number text,
  ADD COLUMN IF NOT EXISTS electronic_invoice_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS electronic_invoice_issued_by uuid,
  ADD COLUMN IF NOT EXISTS electronic_invoice_note text;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_electronic_status_chk;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_electronic_status_chk
  CHECK (electronic_invoice_status IN ('no_facturada','facturada'));

CREATE TABLE IF NOT EXISTS public.invoice_electronic_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  action text NOT NULL,
  external_number text,
  note text,
  actor_id uuid,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_electronic_log_invoice ON public.invoice_electronic_log(invoice_id, created_at DESC);

GRANT SELECT, INSERT ON public.invoice_electronic_log TO authenticated;
GRANT ALL ON public.invoice_electronic_log TO service_role;

ALTER TABLE public.invoice_electronic_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_electronic_log_read" ON public.invoice_electronic_log;
CREATE POLICY "invoice_electronic_log_read"
  ON public.invoice_electronic_log FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'finanzas')
  );

DROP POLICY IF EXISTS "invoice_electronic_log_write" ON public.invoice_electronic_log;
CREATE POLICY "invoice_electronic_log_write"
  ON public.invoice_electronic_log FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'finanzas')
  );

-- Function: mark invoice as electronically issued
CREATE OR REPLACE FUNCTION public.mark_invoice_electronic(
  p_invoice_id uuid,
  p_external_number text,
  p_issued_at timestamptz,
  p_note text
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'finanzas')) THEN
    RAISE EXCEPTION 'Solo administración o finanzas';
  END IF;
  IF p_external_number IS NULL OR length(btrim(p_external_number)) = 0 THEN
    RAISE EXCEPTION 'Debes indicar el número de factura electrónica';
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE user_id = v_uid LIMIT 1;

  UPDATE public.invoices
     SET electronic_invoice_status = 'facturada',
         electronic_invoice_number = btrim(p_external_number),
         electronic_invoice_issued_at = COALESCE(p_issued_at, now()),
         electronic_invoice_issued_by = v_uid,
         electronic_invoice_note = NULLIF(btrim(COALESCE(p_note,'')), '')
   WHERE id = p_invoice_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;

  INSERT INTO public.invoice_electronic_log(invoice_id, action, external_number, note, actor_id, actor_email)
  VALUES (p_invoice_id, 'marked_facturada', btrim(p_external_number), NULLIF(btrim(COALESCE(p_note,'')), ''), v_uid, v_email);
END;
$$;

-- Function: revert electronic mark
CREATE OR REPLACE FUNCTION public.revert_invoice_electronic(
  p_invoice_id uuid,
  p_reason text
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'finanzas')) THEN
    RAISE EXCEPTION 'Solo administración o finanzas';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Motivo requerido (mínimo 5 caracteres)';
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE user_id = v_uid LIMIT 1;

  UPDATE public.invoices
     SET electronic_invoice_status = 'no_facturada',
         electronic_invoice_number = NULL,
         electronic_invoice_issued_at = NULL,
         electronic_invoice_issued_by = NULL,
         electronic_invoice_note = NULL
   WHERE id = p_invoice_id;

  INSERT INTO public.invoice_electronic_log(invoice_id, action, note, actor_id, actor_email)
  VALUES (p_invoice_id, 'reverted', btrim(p_reason), v_uid, v_email);
END;
$$;
