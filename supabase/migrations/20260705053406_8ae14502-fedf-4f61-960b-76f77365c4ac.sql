
-- Helper: crea tareas de aprobación para gerencia + vendedor
CREATE OR REPLACE FUNCTION public.create_approval_tasks(
  p_order_id uuid, p_seller_id uuid, p_brand_id uuid, p_pct numeric,
  p_invoice text, p_customer text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin record;
  v_seller_email text;
  v_reason_admin text;
BEGIN
  SELECT email INTO v_seller_email FROM public.profiles WHERE user_id = p_seller_id LIMIT 1;

  v_reason_admin := 'Vendedor ' || COALESCE(v_seller_email, '(sin email)') ||
    ' solicita aprobación. Cliente: ' || COALESCE(p_customer, 's/n') ||
    CASE WHEN p_invoice IS NOT NULL THEN ' · Fact. ' || p_invoice ELSE '' END ||
    ' · Anticipo del ' || p_pct::text || '%.';

  -- Tarea para el vendedor (informativa, stand-by)
  IF NOT EXISTS (
    SELECT 1 FROM public.seller_tasks
    WHERE order_id = p_order_id AND type = 'approval_pending'
      AND seller_id = p_seller_id AND status = 'pendiente'
  ) THEN
    INSERT INTO public.seller_tasks(seller_id, order_id, brand_id, type, title, reason, severity, status)
    VALUES (
      p_seller_id, p_order_id, p_brand_id, 'approval_pending',
      'Aprobación gerencial pendiente',
      'Anticipo del ' || p_pct::text || '%. La venta está en stand-by hasta la decisión de gerencia.',
      'warning', 'pendiente'
    );
  END IF;

  -- Tarea accionable para cada admin
  FOR v_admin IN
    SELECT user_id FROM public.user_roles WHERE role = 'admin'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.seller_tasks
      WHERE order_id = p_order_id AND type = 'approval_pending'
        AND seller_id = v_admin.user_id AND status = 'pendiente'
    ) THEN
      INSERT INTO public.seller_tasks(seller_id, order_id, brand_id, type, title, reason, severity, status)
      VALUES (
        v_admin.user_id, p_order_id, p_brand_id, 'approval_pending',
        'Aprobación de venta solicitada',
        v_reason_admin,
        'warning', 'pendiente'
      );
    END IF;
  END LOOP;
END $$;

-- Trigger AFTER INSERT sobre orders: si quedó pendiente, crear tareas
CREATE OR REPLACE FUNCTION public.tg_orders_after_insert_approval_tasks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pct numeric;
BEGIN
  IF NEW.approval_status = 'pendiente' AND NEW.created_by IS NOT NULL THEN
    v_pct := CASE WHEN COALESCE(NEW.total,0) > 0
      THEN ROUND((COALESCE(NEW.advance_amount,0) / NEW.total) * 100, 2) ELSE 0 END;
    PERFORM public.create_approval_tasks(
      NEW.id, NEW.created_by, NEW.brand_id, v_pct,
      NEW.invoice_number, NEW.customer_name
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_after_insert_approval_tasks ON public.orders;
CREATE TRIGGER orders_after_insert_approval_tasks
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_orders_after_insert_approval_tasks();

-- request_management_approval: usa helper (crea tareas admin + vendedor)
CREATE OR REPLACE FUNCTION public.request_management_approval(
  p_order_id uuid, p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order record; v_email text; v_pct numeric;
BEGIN
  SELECT id, total, advance_amount, approval_status, created_by, brand_id,
         invoice_number, customer_name
    INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_order IS NULL THEN RAISE EXCEPTION 'Venta no encontrada'; END IF;
  IF v_order.approval_status = 'pendiente' THEN
    RAISE EXCEPTION 'Ya hay una solicitud de aprobación pendiente';
  END IF;

  v_pct := CASE WHEN COALESCE(v_order.total,0) > 0
    THEN ROUND((COALESCE(v_order.advance_amount,0) / v_order.total) * 100, 2) ELSE 0 END;

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

  PERFORM public.create_approval_tasks(
    p_order_id, v_order.created_by, v_order.brand_id, v_pct,
    v_order.invoice_number, v_order.customer_name
  );
END $$;

-- resolve_management_approval: al rechazar, anula la venta
CREATE OR REPLACE FUNCTION public.resolve_management_approval(
  p_order_id uuid, p_decision text, p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order record; v_email text; v_pct numeric;
  v_reason text; v_items jsonb; v_order_row public.orders%ROWTYPE;
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
    THEN ROUND((COALESCE(v_order.advance_amount,0) / v_order.total) * 100, 2) ELSE 0 END;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  -- Log de la decisión
  INSERT INTO public.order_approval_log(
    order_id, action, actor_id, actor_email, note,
    advance_amount, total_amount, advance_percentage
  ) VALUES (
    p_order_id, p_decision, auth.uid(), v_email, p_note,
    v_order.advance_amount, v_order.total, v_pct
  );

  -- Cerrar tareas de aprobación pendientes (vendedor + admins)
  UPDATE public.seller_tasks
    SET status='resuelta', resolved_at=now(), updated_at=now()
    WHERE order_id=p_order_id AND type='approval_pending' AND status='pendiente';

  IF p_decision = 'aprobada' THEN
    UPDATE public.orders
      SET approval_status = 'aprobada',
          approval_resolved_at = now(),
          approval_resolved_by = auth.uid(),
          approval_note = COALESCE(p_note, approval_note),
          updated_at = now()
      WHERE id = p_order_id;

    INSERT INTO public.seller_tasks(seller_id, order_id, brand_id, type, title, reason, severity, status)
    VALUES (
      v_order.created_by, p_order_id, v_order.brand_id, 'approval_granted',
      'Aprobación gerencial concedida',
      COALESCE(p_note, 'La gerencia aprobó la venta. Ya puedes continuar.'),
      'info', 'pendiente'
    );
  ELSE
    -- Rechazada: anular la venta
    v_reason := 'Aprobación gerencial rechazada: ' || COALESCE(p_note, '(sin motivo detallado)');
    IF length(btrim(v_reason)) < 10 THEN v_reason := v_reason || ' — venta anulada.'; END IF;

    -- Notificar al vendedor ANTES de eliminar (por si RLS/orden importa)
    INSERT INTO public.seller_tasks(seller_id, order_id, brand_id, type, title, reason, severity, status)
    VALUES (
      v_order.created_by, NULL, v_order.brand_id, 'approval_rejected',
      'Venta anulada por gerencia',
      v_reason,
      'warning', 'pendiente'
    );

    -- Snapshot + eliminación (misma lógica que delete_order_with_reason, sin re-chequear permisos)
    SELECT * INTO v_order_row FROM public.orders WHERE id = p_order_id;
    SELECT COALESCE(jsonb_agg(to_jsonb(i.*) ORDER BY i.sort_order), '[]'::jsonb)
      INTO v_items FROM public.order_items i WHERE i.order_id = p_order_id;

    INSERT INTO public.order_deletions(
      order_id, brand_id, order_number, invoice_number, customer_name, total,
      reason, order_snapshot, items_snapshot, deleted_by, deleted_by_email
    ) VALUES (
      v_order_row.id, v_order_row.brand_id, v_order_row.order_number, v_order_row.invoice_number,
      v_order_row.customer_name, v_order_row.total,
      v_reason, to_jsonb(v_order_row), v_items, auth.uid(), v_email
    );

    DELETE FROM public.order_payments WHERE order_id = p_order_id;
    DELETE FROM public.order_collection_followups WHERE order_id = p_order_id;
    DELETE FROM public.orders WHERE id = p_order_id;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.request_management_approval(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.request_management_approval(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.resolve_management_approval(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.resolve_management_approval(uuid, text, text) TO authenticated;

-- Backfill: CD-0001 → crear tareas de admin (si no existen)
DO $$
DECLARE v_order record; v_pct numeric;
BEGIN
  SELECT id, created_by, brand_id, total, advance_amount, invoice_number, customer_name
    INTO v_order FROM public.orders
    WHERE invoice_number='CD-0001' AND approval_status='pendiente' LIMIT 1;
  IF v_order.id IS NOT NULL THEN
    v_pct := CASE WHEN COALESCE(v_order.total,0) > 0
      THEN ROUND((COALESCE(v_order.advance_amount,0)/v_order.total)*100, 2) ELSE 0 END;
    PERFORM public.create_approval_tasks(
      v_order.id, v_order.created_by, v_order.brand_id, v_pct,
      v_order.invoice_number, v_order.customer_name
    );
  END IF;
END $$;
