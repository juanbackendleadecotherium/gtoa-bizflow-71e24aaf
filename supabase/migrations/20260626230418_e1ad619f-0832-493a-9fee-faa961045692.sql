
-- Centraliza creación de la notificación "Pendiente por logística / cobro" para el vendedor
CREATE OR REPLACE FUNCTION public.notify_seller_invoice_ready(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_prog record;
  v_title text;
  v_reason text;
  v_label text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id;
  IF NOT FOUND OR v_order.seller_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.seller_tasks
     WHERE order_id = _order_id
       AND type = 'invoice_ready_for_collection'
       AND status = 'pendiente'
  ) THEN
    RETURN;
  END IF;

  SELECT * INTO v_prog FROM public.order_completion_progress(_order_id);

  v_label := COALESCE('Fact. ' || v_order.invoice_number, v_order.order_number, 'esta venta');
  v_title := 'Factura lista — pendiente por logística y cobro del saldo';
  v_reason := 'La factura ' || v_label
           || ' pasó a "Pendiente por logística"'
           || CASE WHEN v_prog.total > 0
                THEN ' (' || v_prog.finished || '/' || v_prog.total || ' productos terminados).'
                ELSE '.' END
           || ' Coordina con el cliente el cobro del saldo pendiente.';

  INSERT INTO public.seller_tasks(
    seller_id, order_id, brand_id, type, title, reason, severity, status
  ) VALUES (
    v_order.seller_id, _order_id, v_order.brand_id,
    'invoice_ready_for_collection', v_title, v_reason, 'info', 'pendiente'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notify_seller_invoice_ready(uuid) FROM PUBLIC, anon, authenticated;

-- Trigger en orders: cuando el status pase a "pendiente-por-logistica" (manual o por código),
-- crear la tarea para el vendedor si aún no existe.
CREATE OR REPLACE FUNCTION public.trg_orders_notify_logistica_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_slug text;
BEGIN
  IF NEW.status_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.status_id IS NOT DISTINCT FROM OLD.status_id THEN
    RETURN NEW;
  END IF;

  SELECT slug INTO v_slug FROM public.order_statuses WHERE id = NEW.status_id;
  IF v_slug = 'pendiente-por-logistica' THEN
    PERFORM public.notify_seller_invoice_ready(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_notify_logistica ON public.orders;
CREATE TRIGGER trg_orders_notify_logistica
AFTER INSERT OR UPDATE OF status_id ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_orders_notify_logistica_fn();

-- Refactor: on_order_item_finished delega la creación de la tarea a la función centralizada.
-- Esto además garantiza que tras hacer UPDATE de status_id (que dispara el nuevo trigger),
-- la tarea ya existirá por uno de los dos caminos sin duplicarse.
CREATE OR REPLACE FUNCTION public.on_order_item_finished()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_prog record;
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

  -- 1) Estado de la factura → "Pendiente por logística"
  SELECT id INTO v_target_status
    FROM public.order_statuses
   WHERE brand_id = v_order.brand_id AND slug = 'pendiente-por-logistica'
   LIMIT 1;

  IF v_target_status IS NOT NULL AND v_order.status_id IS DISTINCT FROM v_target_status THEN
    PERFORM set_config('app.status_note',
      'Todos los productos (' || v_prog.finished || '/' || v_prog.total ||
      ') están terminados — factura lista para logística.', true);
    UPDATE public.orders SET status_id = v_target_status WHERE id = v_order.id;
    -- El trigger trg_orders_notify_logistica creará la tarea automáticamente.
  ELSE
    -- Si el status ya era el correcto (no hay UPDATE que dispare el trigger),
    -- forzamos la creación de la tarea aquí.
    PERFORM public.notify_seller_invoice_ready(NEW.order_id);
  END IF;

  -- 2) Novedad de production_orders → pendiente_por_logistica
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

  RETURN NEW;
END;
$$;
