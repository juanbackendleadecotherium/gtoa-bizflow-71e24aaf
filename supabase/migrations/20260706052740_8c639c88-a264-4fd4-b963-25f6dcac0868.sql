-- Retry: same migration after transient deadlock
ALTER TABLE public.seller_tasks
  ADD COLUMN IF NOT EXISTS forms_completed_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_production_order_hitos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_first_issue_date date;
  v_promised date;
BEGIN
  IF NEW.invoice_date IS NULL AND NEW.order_id IS NOT NULL THEN
    SELECT MIN(created_at)::date INTO v_first_issue_date
      FROM public.invoice_versions WHERE order_id = NEW.order_id;
    IF v_first_issue_date IS NOT NULL THEN NEW.invoice_date := v_first_issue_date; END IF;
  END IF;
  IF NEW.client_promised_date IS NULL AND NEW.order_id IS NOT NULL THEN
    SELECT estimated_delivery_date INTO v_promised FROM public.orders WHERE id = NEW.order_id;
    IF v_promised IS NOT NULL THEN NEW.client_promised_date := v_promised; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_production_order_hitos ON public.production_orders;
CREATE TRIGGER trg_set_production_order_hitos
BEFORE INSERT OR UPDATE OF order_id ON public.production_orders
FOR EACH ROW EXECUTE FUNCTION public.set_production_order_hitos();

CREATE OR REPLACE FUNCTION public.sync_invoice_date_to_production_orders()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.production_orders SET invoice_date = NEW.created_at::date
   WHERE order_id = NEW.order_id AND invoice_date IS NULL;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_invoice_date_to_pos ON public.invoice_versions;
CREATE TRIGGER trg_sync_invoice_date_to_pos
AFTER INSERT ON public.invoice_versions
FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_date_to_production_orders();

CREATE OR REPLACE FUNCTION public.sync_estimated_delivery_to_pos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estimated_delivery_date IS DISTINCT FROM OLD.estimated_delivery_date
     AND NEW.estimated_delivery_date IS NOT NULL THEN
    UPDATE public.production_orders
       SET client_promised_date = NEW.estimated_delivery_date
     WHERE order_id = NEW.id
       AND (client_promised_date IS NULL
            OR client_promised_date IS DISTINCT FROM NEW.estimated_delivery_date);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_estimated_delivery_to_pos ON public.orders;
CREATE TRIGGER trg_sync_estimated_delivery_to_pos
AFTER UPDATE OF estimated_delivery_date ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_estimated_delivery_to_pos();

CREATE OR REPLACE FUNCTION public.sync_order_status_on_production()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order_id uuid; v_brand_id uuid; v_current_status uuid;
  v_target uuid; v_pending int; v_current_slug text;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  IF v_order_id IS NULL THEN RETURN NEW; END IF;
  SELECT o.brand_id, o.status_id, s.slug INTO v_brand_id, v_current_status, v_current_slug
    FROM public.orders o LEFT JOIN public.order_statuses s ON s.id = o.status_id
   WHERE o.id = v_order_id;
  IF v_current_slug NOT IN ('pendiente-planimetria','confirmado') THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO v_pending FROM public.order_items
   WHERE order_id = v_order_id
     AND production_order_id IS NULL
     AND COALESCE(is_standard_product, false) = false;
  IF v_pending > 0 THEN RETURN NEW; END IF;
  SELECT id INTO v_target FROM public.order_statuses
   WHERE brand_id = v_brand_id AND slug = 'en-produccion' LIMIT 1;
  IF v_target IS NOT NULL AND v_target IS DISTINCT FROM v_current_status THEN
    PERFORM set_config('app.status_note','Todos los productos enviados a producción — cambio automático.', true);
    UPDATE public.orders SET status_id = v_target WHERE id = v_order_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_order_status_on_production ON public.order_items;
CREATE TRIGGER trg_sync_order_status_on_production
AFTER INSERT OR UPDATE OF production_order_id, is_standard_product ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.sync_order_status_on_production();

CREATE OR REPLACE FUNCTION public.mark_task_forms_done(p_task_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_task public.seller_tasks%ROWTYPE;
  v_actor uuid := auth.uid();
  v_actor_email text; v_po_creator uuid; v_po_code text;
  v_invoice text; v_order_no text;
  v_title text; v_reason text; v_new_type text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT * INTO v_task FROM public.seller_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarea no encontrada'; END IF;
  IF v_task.seller_id <> v_actor THEN RAISE EXCEPTION 'No puedes marcar esta tarea'; END IF;
  IF v_task.type NOT IN ('partial_shipment','invoice_ready_for_collection') THEN
    RAISE EXCEPTION 'Tipo de tarea no soportado';
  END IF;
  SELECT email INTO v_actor_email FROM auth.users WHERE id = v_actor;
  UPDATE public.seller_tasks
     SET status='resuelta', forms_completed_at=now(), resolved_at=now(), updated_at=now()
   WHERE id = p_task_id;
  SELECT po.created_by, po.code INTO v_po_creator, v_po_code
    FROM public.production_orders po
   WHERE po.order_id = v_task.order_id
   ORDER BY po.created_at ASC LIMIT 1;
  SELECT invoice_number, order_number INTO v_invoice, v_order_no
    FROM public.orders WHERE id = v_task.order_id;
  IF v_task.type = 'partial_shipment' THEN
    v_new_type := 'partial_shipment_forms_done';
    v_title := 'Forms de entrega parcial listo — verifica logística';
    v_reason := 'El vendedor ' || COALESCE(v_actor_email,'') ||
                ' llenó el formulario de logística y confirmó el cobro del saldo para la venta ' ||
                COALESCE(v_invoice, v_order_no, '') ||
                CASE WHEN v_po_code IS NOT NULL THEN ' (OP ' || v_po_code || ')' ELSE '' END ||
                '. Puedes proceder con la entrega parcial.';
  ELSE
    v_new_type := 'invoice_collection_forms_done';
    v_title := 'Cuenta de cobro ' || COALESCE(v_invoice,'') || ' — Forms listo, procede logística';
    v_reason := 'El vendedor ' || COALESCE(v_actor_email,'') ||
                ' llenó el formulario de logística y confirmó el cobro del saldo. ' ||
                'Puedes coordinar la entrega final con el cliente.';
  END IF;
  IF v_po_creator IS NOT NULL AND v_po_creator <> v_actor THEN
    INSERT INTO public.seller_tasks(
      seller_id, order_id, production_order_id, order_item_id, brand_id,
      type, title, reason, severity, status
    ) VALUES (
      v_po_creator, v_task.order_id, v_task.production_order_id, v_task.order_item_id,
      v_task.brand_id, v_new_type, v_title, v_reason, 'info', 'pendiente'
    );
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.mark_task_forms_done(uuid) TO authenticated;

-- Backfills
UPDATE public.production_orders po
   SET invoice_date = sub.first_issue
  FROM (SELECT order_id, MIN(created_at)::date AS first_issue
          FROM public.invoice_versions GROUP BY order_id) sub
 WHERE po.order_id = sub.order_id AND po.invoice_date IS NULL;

UPDATE public.production_orders po
   SET client_promised_date = o.estimated_delivery_date
  FROM public.orders o
 WHERE po.order_id = o.id
   AND po.client_promised_date IS NULL
   AND o.estimated_delivery_date IS NOT NULL;

DO $$
DECLARE r record; v_target uuid;
BEGIN
  FOR r IN
    SELECT o.id, o.brand_id
      FROM public.orders o
      LEFT JOIN public.order_statuses os ON os.id = o.status_id
     WHERE COALESCE(os.slug,'') IN ('pendiente-planimetria','confirmado')
       AND EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id)
       AND NOT EXISTS (
         SELECT 1 FROM public.order_items oi
          WHERE oi.order_id = o.id
            AND oi.production_order_id IS NULL
            AND COALESCE(oi.is_standard_product,false) = false)
  LOOP
    SELECT id INTO v_target FROM public.order_statuses
     WHERE brand_id = r.brand_id AND slug = 'en-produccion' LIMIT 1;
    IF v_target IS NOT NULL THEN
      PERFORM set_config('app.status_note','Backfill: todos los productos enviados a producción.', true);
      UPDATE public.orders SET status_id = v_target WHERE id = r.id;
    END IF;
  END LOOP;
END $$;