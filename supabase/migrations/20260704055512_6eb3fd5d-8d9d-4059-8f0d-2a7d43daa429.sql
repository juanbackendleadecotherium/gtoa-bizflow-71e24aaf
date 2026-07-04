
-- =====================================================
-- 1. APROBACIÓN GERENCIAL (JD-N04)
-- =====================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS requires_management_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'no_requerida'
    CHECK (approval_status IN ('no_requerida','pendiente','aprobada','rechazada')),
  ADD COLUMN IF NOT EXISTS approval_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_requested_by uuid,
  ADD COLUMN IF NOT EXISTS approval_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_resolved_by uuid,
  ADD COLUMN IF NOT EXISTS approval_note text;

CREATE INDEX IF NOT EXISTS idx_orders_approval_status
  ON public.orders(approval_status) WHERE approval_status = 'pendiente';

-- Log de aprobaciones
CREATE TABLE IF NOT EXISTS public.order_approval_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('solicitada','aprobada','rechazada')),
  actor_id uuid,
  actor_email text,
  note text,
  advance_amount numeric(14,2),
  total_amount numeric(14,2),
  advance_percentage numeric(6,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.order_approval_log TO authenticated;
GRANT ALL ON public.order_approval_log TO service_role;

ALTER TABLE public.order_approval_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins ven todo el log de aprobaciones"
  ON public.order_approval_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Vendedores ven el log de sus ventas"
  ON public.order_approval_log FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_approval_log.order_id
      AND o.created_by = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_order_approval_log_order ON public.order_approval_log(order_id, created_at DESC);

-- Función: solicitar aprobación
CREATE OR REPLACE FUNCTION public.request_management_approval(
  p_order_id uuid,
  p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order record;
  v_email text;
  v_pct numeric;
BEGIN
  SELECT id, total, advance_amount, approval_status, created_by
    INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_order IS NULL THEN RAISE EXCEPTION 'Venta no encontrada'; END IF;

  IF v_order.approval_status = 'pendiente' THEN
    RAISE EXCEPTION 'Ya hay una solicitud de aprobación pendiente';
  END IF;

  v_pct := CASE WHEN COALESCE(v_order.total,0) > 0
    THEN ROUND((COALESCE(v_order.advance_amount,0) / v_order.total) * 100, 2)
    ELSE 0 END;

  UPDATE public.orders
    SET requires_management_approval = true,
        approval_status = 'pendiente',
        approval_requested_at = now(),
        approval_requested_by = auth.uid(),
        approval_note = p_note,
        approval_resolved_at = NULL,
        approval_resolved_by = NULL,
        updated_at = now()
    WHERE id = p_order_id;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.order_approval_log(
    order_id, action, actor_id, actor_email, note,
    advance_amount, total_amount, advance_percentage
  ) VALUES (
    p_order_id, 'solicitada', auth.uid(), v_email, p_note,
    v_order.advance_amount, v_order.total, v_pct
  );

  -- Tarea para admins
  INSERT INTO public.seller_tasks(order_id, title, description, task_type, priority, brand_id)
  SELECT p_order_id,
         'Aprobación gerencial pendiente',
         'Venta con anticipo del ' || v_pct::text || '% requiere aprobación.',
         'approval',
         'alta',
         (SELECT brand_id FROM public.orders WHERE id = p_order_id);
END $$;

REVOKE ALL ON FUNCTION public.request_management_approval(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.request_management_approval(uuid, text) TO authenticated;

-- Función: resolver aprobación (solo admin)
CREATE OR REPLACE FUNCTION public.resolve_management_approval(
  p_order_id uuid,
  p_decision text, -- 'aprobada' | 'rechazada'
  p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order record;
  v_email text;
  v_pct numeric;
  v_brand_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Solo administradores pueden resolver aprobaciones';
  END IF;

  IF p_decision NOT IN ('aprobada','rechazada') THEN
    RAISE EXCEPTION 'Decisión inválida';
  END IF;

  SELECT id, total, advance_amount, approval_status, created_by, brand_id
    INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_order IS NULL THEN RAISE EXCEPTION 'Venta no encontrada'; END IF;
  IF v_order.approval_status <> 'pendiente' THEN
    RAISE EXCEPTION 'No hay una solicitud pendiente';
  END IF;

  v_pct := CASE WHEN COALESCE(v_order.total,0) > 0
    THEN ROUND((COALESCE(v_order.advance_amount,0) / v_order.total) * 100, 2)
    ELSE 0 END;

  UPDATE public.orders
    SET approval_status = p_decision,
        approval_resolved_at = now(),
        approval_resolved_by = auth.uid(),
        approval_note = COALESCE(p_note, approval_note),
        updated_at = now()
    WHERE id = p_order_id;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.order_approval_log(
    order_id, action, actor_id, actor_email, note,
    advance_amount, total_amount, advance_percentage
  ) VALUES (
    p_order_id, p_decision, auth.uid(), v_email, p_note,
    v_order.advance_amount, v_order.total, v_pct
  );

  -- Tarea para el vendedor
  INSERT INTO public.seller_tasks(order_id, title, description, task_type, priority, brand_id, assigned_to)
  VALUES (
    p_order_id,
    CASE WHEN p_decision = 'aprobada'
      THEN 'Aprobación gerencial concedida'
      ELSE 'Aprobación gerencial rechazada' END,
    COALESCE(p_note, ''),
    'approval',
    'normal',
    v_order.brand_id,
    v_order.created_by
  );
END $$;

REVOKE ALL ON FUNCTION public.resolve_management_approval(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.resolve_management_approval(uuid, text, text) TO authenticated;


-- =====================================================
-- 2. PLAN SEPARE (JD-N05)
-- =====================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS sale_type text NOT NULL DEFAULT 'normal'
    CHECK (sale_type IN ('normal','plan_separe')),
  ADD COLUMN IF NOT EXISTS separe_activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS separe_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS price_locked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_sale_type ON public.orders(sale_type) WHERE sale_type = 'plan_separe';

-- Trigger: al crear una venta plan_separe, sellar activación + congelar precio
CREATE OR REPLACE FUNCTION public.tg_orders_plan_separe_init() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.sale_type = 'plan_separe' AND NEW.separe_activated_at IS NULL THEN
    NEW.separe_activated_at := now();
  END IF;
  IF NEW.sale_type = 'plan_separe' AND NEW.price_locked_at IS NULL THEN
    NEW.price_locked_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_plan_separe_init ON public.orders;
CREATE TRIGGER orders_plan_separe_init
  BEFORE INSERT OR UPDATE OF sale_type ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_orders_plan_separe_init();

-- Función que revisa si un separe llegó al 50% y marca completado
CREATE OR REPLACE FUNCTION public.check_separe_completion(p_order_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total numeric;
  v_paid numeric;
  v_sale_type text;
  v_already timestamptz;
  v_brand_id uuid;
  v_seller uuid;
BEGIN
  SELECT total, sale_type, separe_completed_at, brand_id, created_by
    INTO v_total, v_sale_type, v_already, v_brand_id, v_seller
    FROM public.orders WHERE id = p_order_id;

  IF v_sale_type <> 'plan_separe' OR v_already IS NOT NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_paid
    FROM public.order_payments WHERE order_id = p_order_id;

  IF v_total > 0 AND v_paid >= v_total * 0.5 THEN
    UPDATE public.orders
      SET separe_completed_at = now(), updated_at = now()
      WHERE id = p_order_id;

    INSERT INTO public.seller_tasks(order_id, title, description, task_type, priority, brand_id, assigned_to)
    VALUES (
      p_order_id,
      'Plan Separe completado — listo para producción',
      'El cliente completó el 50% del anticipo. Ya puedes enviar la venta a producción.',
      'plan_separe',
      'alta',
      v_brand_id,
      v_seller
    );
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.check_separe_completion(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.check_separe_completion(uuid) TO authenticated;

-- Trigger que dispara la revisión al insertar/actualizar/borrar pagos
CREATE OR REPLACE FUNCTION public.tg_order_payments_check_separe() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.check_separe_completion(COALESCE(NEW.order_id, OLD.order_id));
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS order_payments_check_separe ON public.order_payments;
CREATE TRIGGER order_payments_check_separe
  AFTER INSERT OR UPDATE OR DELETE ON public.order_payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_order_payments_check_separe();
