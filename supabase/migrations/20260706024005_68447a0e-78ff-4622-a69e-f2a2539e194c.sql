
-- Fix: seller_tasks columns are (reason, type, severity, seller_id), not (description, task_type, priority, assigned_to)

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

    INSERT INTO public.seller_tasks(order_id, title, reason, type, severity, brand_id, seller_id)
    VALUES (
      p_order_id,
      'Plan Separe completado — listo para producción',
      'El cliente completó el 50% del anticipo. Ya puedes enviar la venta a producción.',
      'plan_separe_ready',
      'alta',
      v_brand_id,
      v_seller
    );
  END IF;
END $$;

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
  v_admin_id uuid;
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

  -- Crear una tarea por cada admin
  FOR v_admin_id IN
    SELECT user_id FROM public.user_roles WHERE role = 'admin'::app_role
  LOOP
    INSERT INTO public.seller_tasks(order_id, title, reason, type, severity, brand_id, seller_id)
    VALUES (
      p_order_id,
      'Aprobación de venta solicitada',
      'Venta con anticipo del ' || v_pct::text || '% requiere aprobación.',
      'approval_pending',
      'alta',
      v_order.brand_id,
      v_admin_id
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.resolve_management_approval(
  p_order_id uuid,
  p_decision text,
  p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order record;
  v_email text;
  v_pct numeric;
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

  -- Marcar la tarea de aprobación como resuelta para los admins
  UPDATE public.seller_tasks
    SET status = 'resuelta', resolved_at = now()
    WHERE order_id = p_order_id
      AND type = 'approval_pending'
      AND status = 'pendiente';

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.order_approval_log(
    order_id, action, actor_id, actor_email, note,
    advance_amount, total_amount, advance_percentage
  ) VALUES (
    p_order_id, p_decision, auth.uid(), v_email, p_note,
    v_order.advance_amount, v_order.total, v_pct
  );

  -- Notificar al vendedor
  IF v_order.created_by IS NOT NULL THEN
    INSERT INTO public.seller_tasks(order_id, title, reason, type, severity, brand_id, seller_id)
    VALUES (
      p_order_id,
      CASE WHEN p_decision = 'aprobada'
        THEN 'Aprobación gerencial concedida'
        ELSE 'Aprobación gerencial rechazada' END,
      COALESCE(p_note, ''),
      CASE WHEN p_decision = 'aprobada' THEN 'approval_granted' ELSE 'approval_rejected' END,
      'normal',
      v_order.brand_id,
      v_order.created_by
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.toggle_item_partial_shipment(
  p_item_id uuid,
  p_enabled boolean,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text;
  v_order_id uuid;
  v_seller_id uuid;
  v_brand_id uuid;
  v_item_name text;
  v_order_number text;
  v_is_admin boolean;
  v_is_seller boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT oi.order_id, oi.description, o.created_by, o.order_number, o.brand_id
    INTO v_order_id, v_item_name, v_seller_id, v_order_number, v_brand_id
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = p_item_id;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'order item not found';
  END IF;

  v_is_admin := public.has_role(v_actor, 'admin'::app_role);
  v_is_seller := (v_seller_id = v_actor);

  IF NOT (v_is_admin OR v_is_seller) THEN
    RAISE EXCEPTION 'forbidden: only admin or assigned seller can toggle partial shipment';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_actor;

  UPDATE public.order_items
     SET partial_shipment_enabled = p_enabled,
         partial_shipment_enabled_at = CASE WHEN p_enabled THEN now() ELSE NULL END,
         partial_shipment_enabled_by = CASE WHEN p_enabled THEN v_actor ELSE NULL END
   WHERE id = p_item_id;

  INSERT INTO public.order_item_partial_log(order_id, order_item_id, action, actor_id, actor_email, note)
  VALUES (v_order_id, p_item_id, CASE WHEN p_enabled THEN 'enabled' ELSE 'disabled' END, v_actor, v_email, p_note);

  IF p_enabled AND v_seller_id IS NOT NULL THEN
    INSERT INTO public.seller_tasks(order_id, title, reason, type, severity, brand_id, seller_id)
    VALUES (
      v_order_id,
      'Coordinar entrega parcial',
      'Coordinar entrega parcial de ítem "' || COALESCE(v_item_name,'(sin nombre)') || '" con el cliente',
      'partial_shipment',
      'normal',
      v_brand_id,
      v_seller_id
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'enabled', p_enabled);
END $$;
