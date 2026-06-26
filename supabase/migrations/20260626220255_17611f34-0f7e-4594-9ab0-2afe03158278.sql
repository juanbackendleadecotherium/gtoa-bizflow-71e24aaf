
-- 1. Columns
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS production_finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS production_finished_by uuid,
  ADD COLUMN IF NOT EXISTS production_finished_by_email text;

CREATE INDEX IF NOT EXISTS idx_order_items_finished_at ON public.order_items(production_finished_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_finished ON public.order_items(order_id, production_finished_at);

-- 2. Progress helper (single source of truth)
CREATE OR REPLACE FUNCTION public.order_completion_progress(_order_id uuid)
RETURNS TABLE(total int, finished int, all_finished boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE production_finished_at IS NOT NULL)::int AS finished,
    (count(*) > 0 AND count(*) = count(*) FILTER (WHERE production_finished_at IS NOT NULL)) AS all_finished
  FROM public.order_items
  WHERE order_id = _order_id;
$$;

REVOKE ALL ON FUNCTION public.order_completion_progress(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_completion_progress(uuid) TO authenticated, service_role;

-- 3. Authorisation helper
CREATE OR REPLACE FUNCTION public.can_finish_order_item(_user_id uuid, _item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
     WHERE oi.id = _item_id
       AND (
         public.has_role(_user_id, 'admin')
         OR (public.has_role(_user_id, 'operativo') AND public.has_brand_access(_user_id, o.brand_id))
       )
  );
$$;

REVOKE ALL ON FUNCTION public.can_finish_order_item(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_finish_order_item(uuid, uuid) TO authenticated, service_role;

-- 4. RPC to mark / unmark (bypasses RLS via SECURITY DEFINER, internal authz)
CREATE OR REPLACE FUNCTION public.mark_order_item_finished(_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT public.can_finish_order_item(v_uid, _item_id) THEN
    RAISE EXCEPTION 'No autorizado para marcar este producto como terminado';
  END IF;
  SELECT email INTO v_email FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  UPDATE public.order_items
     SET production_finished_at = now(),
         production_finished_by = v_uid,
         production_finished_by_email = v_email
   WHERE id = _item_id
     AND production_finished_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_order_item_finished(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_order_item_finished(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.unmark_order_item_finished(_item_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Sólo administradores pueden revertir un producto terminado';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN
    RAISE EXCEPTION 'Indica un motivo (mínimo 10 caracteres) para revertir el estado';
  END IF;
  UPDATE public.order_items
     SET production_finished_at = NULL,
         production_finished_by = NULL,
         production_finished_by_email = NULL
   WHERE id = _item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.unmark_order_item_finished(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unmark_order_item_finished(uuid, text) TO authenticated, service_role;

-- 5. Trigger: audit + notify-on-complete
CREATE OR REPLACE FUNCTION public.on_order_item_finished()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_prog record;
  v_title text;
  v_reason text;
BEGIN
  -- Only fire on transitions
  IF NEW.production_finished_at IS NOT DISTINCT FROM OLD.production_finished_at THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;

  -- Audit
  INSERT INTO public.order_audit_log(
    order_id, changed_by, changed_by_email, action, entity, entity_id, field, old_value, new_value
  ) VALUES (
    NEW.order_id, NEW.production_finished_by, NEW.production_finished_by_email,
    CASE WHEN NEW.production_finished_at IS NOT NULL THEN 'item_finished' ELSE 'item_unfinished' END,
    'order_item', NEW.id, 'production_finished_at',
    to_jsonb(OLD.production_finished_at), to_jsonb(NEW.production_finished_at)
  );

  -- Only check completeness on transition to finished
  IF NEW.production_finished_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF v_order.seller_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_prog FROM public.order_completion_progress(NEW.order_id);
  IF NOT v_prog.all_finished THEN
    RETURN NEW;
  END IF;

  -- Idempotent: skip if a pending task already exists
  IF EXISTS (
    SELECT 1 FROM public.seller_tasks
     WHERE order_id = NEW.order_id
       AND type = 'invoice_ready_for_collection'
       AND status = 'pendiente'
  ) THEN
    RETURN NEW;
  END IF;

  v_title := 'Factura lista — gestiona el cobro del saldo';
  v_reason := 'Todos los productos de '
           || COALESCE('Fact. ' || v_order.invoice_number, v_order.order_number, 'esta venta')
           || ' (' || v_prog.finished || '/' || v_prog.total || ') están terminados en producción. '
           || 'Coordina con el cliente el cobro del saldo pendiente.';

  INSERT INTO public.seller_tasks(
    seller_id, order_id, brand_id, type, title, reason, severity, status
  ) VALUES (
    v_order.seller_id, NEW.order_id, v_order.brand_id,
    'invoice_ready_for_collection', v_title, v_reason, 'info', 'pendiente'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_item_finished ON public.order_items;
CREATE TRIGGER trg_order_item_finished
AFTER UPDATE OF production_finished_at ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.on_order_item_finished();

-- 6. Realtime on order_items (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'order_items'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items';
  END IF;
END $$;

-- 7. Backfill: items whose production_order is 'listo'/'entregado' are considered finished
UPDATE public.order_items oi
   SET production_finished_at = COALESCE(po.completed_at, now())
  FROM public.production_orders po
 WHERE oi.production_order_id = po.id
   AND oi.production_finished_at IS NULL
   AND po.status IN ('listo', 'entregado');
