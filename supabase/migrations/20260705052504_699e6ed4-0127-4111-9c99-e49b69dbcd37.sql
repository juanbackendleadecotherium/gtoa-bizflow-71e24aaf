
-- 1) Trigger: al crear una venta normal con anticipo < 50%, forzar 'pendiente'
CREATE OR REPLACE FUNCTION public.tg_orders_auto_require_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.sale_type = 'normal'
     AND COALESCE(NEW.total,0) > 0
     AND COALESCE(NEW.advance_amount,0) < NEW.total * 0.5 - 0.01
     AND COALESCE(NEW.approval_status, 'no_requerida') = 'no_requerida' THEN
    NEW.requires_management_approval := true;
    NEW.approval_status := 'pendiente';
    NEW.approval_requested_at := COALESCE(NEW.approval_requested_at, now());
    NEW.approval_requested_by := COALESCE(NEW.approval_requested_by, NEW.created_by);
    NEW.approval_note := COALESCE(NEW.approval_note,
      'Anticipo por debajo del 50% al crear la venta.');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_auto_require_approval ON public.orders;
CREATE TRIGGER orders_auto_require_approval
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_orders_auto_require_approval();

-- 2) request_management_approval: columnas correctas de seller_tasks
CREATE OR REPLACE FUNCTION public.request_management_approval(
  p_order_id uuid,
  p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order record; v_email text; v_pct numeric;
BEGIN
  SELECT id, total, advance_amount, approval_status, created_by, brand_id
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

  INSERT INTO public.seller_tasks(seller_id, order_id, brand_id, type, title, reason, severity, status)
  VALUES (
    v_order.created_by, p_order_id, v_order.brand_id, 'approval_pending',
    'Aprobación gerencial pendiente',
    'Anticipo del ' || v_pct::text || '%. Esperando decisión de gerencia.',
    'warning', 'pendiente'
  );
END $$;

-- 3) resolve_management_approval: columnas correctas
CREATE OR REPLACE FUNCTION public.resolve_management_approval(
  p_order_id uuid, p_decision text, p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order record; v_email text; v_pct numeric;
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

  -- Cerrar tareas pendientes de aprobación de esta venta
  UPDATE public.seller_tasks
    SET status='resuelta', resolved_at=now(), updated_at=now()
    WHERE order_id=p_order_id AND type='approval_pending' AND status='pendiente';

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.order_approval_log(
    order_id, action, actor_id, actor_email, note,
    advance_amount, total_amount, advance_percentage
  ) VALUES (
    p_order_id, p_decision, auth.uid(), v_email, p_note,
    v_order.advance_amount, v_order.total, v_pct
  );

  INSERT INTO public.seller_tasks(seller_id, order_id, brand_id, type, title, reason, severity, status)
  VALUES (
    v_order.created_by, p_order_id, v_order.brand_id,
    CASE WHEN p_decision='aprobada' THEN 'approval_granted' ELSE 'approval_rejected' END,
    CASE WHEN p_decision='aprobada'
      THEN 'Aprobación gerencial concedida'
      ELSE 'Aprobación gerencial rechazada' END,
    COALESCE(p_note, ''),
    CASE WHEN p_decision='aprobada' THEN 'info' ELSE 'warning' END,
    'pendiente'
  );
END $$;

-- 4) Fix venta CD-0001
DO $$
DECLARE v_order_id uuid; v_pct numeric; v_seller uuid; v_email text; v_brand uuid;
BEGIN
  SELECT id, created_by, brand_id,
    ROUND((COALESCE(advance_amount,0)/NULLIF(total,0))*100, 2)
  INTO v_order_id, v_seller, v_brand, v_pct
  FROM public.orders
  WHERE invoice_number='CD-0001' AND approval_status='no_requerida'
  LIMIT 1;

  IF v_order_id IS NOT NULL THEN
    UPDATE public.orders SET
      requires_management_approval = true,
      approval_status = 'pendiente',
      approval_requested_at = now(),
      approval_requested_by = v_seller,
      approval_note = 'Anticipo del ' || v_pct::text || '% — requiere aprobación gerencial.'
    WHERE id = v_order_id;

    SELECT email INTO v_email FROM auth.users WHERE id = v_seller;

    INSERT INTO public.order_approval_log(order_id, action, actor_id, actor_email, note,
      advance_amount, total_amount, advance_percentage)
    SELECT id, 'solicitada', v_seller, v_email,
      'Corrección: la venta se creó con anticipo insuficiente y no había quedado marcada como pendiente.',
      advance_amount, total, v_pct
    FROM public.orders WHERE id = v_order_id;

    INSERT INTO public.seller_tasks(seller_id, order_id, brand_id, type, title, reason, severity, status)
    VALUES (v_seller, v_order_id, v_brand, 'approval_pending',
      'Aprobación gerencial pendiente',
      'Anticipo del ' || v_pct::text || '%. Esperando decisión de gerencia.',
      'warning', 'pendiente');
  END IF;
END $$;
