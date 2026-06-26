
CREATE OR REPLACE FUNCTION public.on_order_item_finished()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_prog record;
  v_title text;
  v_reason text;
  v_target_status uuid;
  v_po record;
BEGIN
  IF NEW.production_finished_at IS NOT DISTINCT FROM OLD.production_finished_at THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;

  INSERT INTO public.order_audit_log(
    order_id, changed_by, changed_by_email, action, entity, entity_id, field, old_value, new_value
  ) VALUES (
    NEW.order_id, NEW.production_finished_by, NEW.production_finished_by_email,
    CASE WHEN NEW.production_finished_at IS NOT NULL THEN 'item_finished' ELSE 'item_unfinished' END,
    'order_item', NEW.id, 'production_finished_at',
    to_jsonb(OLD.production_finished_at), to_jsonb(NEW.production_finished_at)
  );

  IF NEW.production_finished_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_prog FROM public.order_completion_progress(NEW.order_id);
  IF NOT v_prog.all_finished THEN
    RETURN NEW;
  END IF;

  -- 1) Mover el estado de la factura a "Pendiente por logística"
  SELECT id INTO v_target_status
    FROM public.order_statuses
   WHERE brand_id = v_order.brand_id AND slug = 'pendiente-por-logistica'
   LIMIT 1;

  IF v_target_status IS NOT NULL AND v_order.status_id IS DISTINCT FROM v_target_status THEN
    PERFORM set_config('app.status_note',
      'Todos los productos (' || v_prog.finished || '/' || v_prog.total ||
      ') están terminados — factura lista para logística.', true);
    UPDATE public.orders SET status_id = v_target_status WHERE id = v_order.id;
  END IF;

  -- 2) Mover la novedad de las production_orders asociadas a "pendiente_por_logistica"
  --    (sin pisar estados finales o de decisión manual)
  FOR v_po IN
    SELECT DISTINCT po.id, po.novedad, po.brand_id
      FROM public.production_orders po
      JOIN public.order_items oi ON oi.production_order_id = po.id
     WHERE oi.order_id = NEW.order_id
       AND COALESCE(po.novedad, 'pendiente') IN ('pendiente','cotizando','produccion')
  LOOP
    UPDATE public.production_orders
       SET novedad = 'pendiente_por_logistica'
     WHERE id = v_po.id;

    INSERT INTO public.production_audit_log(
      production_order_id, brand_id, action, field, old_value, new_value, note,
      changed_by, changed_by_email
    ) VALUES (
      v_po.id, v_po.brand_id, 'novedad_auto', 'novedad',
      to_jsonb(v_po.novedad), to_jsonb('pendiente_por_logistica'::text),
      'Factura completa → pendiente por logística',
      NEW.production_finished_by, NEW.production_finished_by_email
    );
  END LOOP;

  -- 3) Notificación al vendedor (factura lista + cobro)
  IF v_order.seller_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.seller_tasks
     WHERE order_id = NEW.order_id
       AND type = 'invoice_ready_for_collection'
       AND status = 'pendiente'
  ) THEN
    v_title := 'Factura lista — pendiente por logística y cobro del saldo';
    v_reason := 'Todos los productos de '
             || COALESCE('Fact. ' || v_order.invoice_number, v_order.order_number, 'esta venta')
             || ' (' || v_prog.finished || '/' || v_prog.total || ') están terminados. '
             || 'La factura pasó a "Pendiente por logística". Coordina con el cliente el cobro del saldo pendiente.';
    INSERT INTO public.seller_tasks(
      seller_id, order_id, brand_id, type, title, reason, severity, status
    ) VALUES (
      v_order.seller_id, NEW.order_id, v_order.brand_id,
      'invoice_ready_for_collection', v_title, v_reason, 'info', 'pendiente'
    );
  END IF;

  RETURN NEW;
END;
$function$;
