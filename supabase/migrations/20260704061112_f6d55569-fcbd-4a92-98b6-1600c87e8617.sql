-- 1. Columns on order_items
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS partial_shipment_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS partial_shipment_enabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS partial_shipment_enabled_by uuid,
  ADD COLUMN IF NOT EXISTS partial_delivered_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_order_items_partial_enabled
  ON public.order_items(order_id) WHERE partial_shipment_enabled = true;

-- 2. Audit log table
CREATE TABLE IF NOT EXISTS public.order_item_partial_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  order_item_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('enabled','disabled','delivered')),
  actor_id uuid,
  actor_email text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.order_item_partial_log TO authenticated;
GRANT ALL ON public.order_item_partial_log TO service_role;

ALTER TABLE public.order_item_partial_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read partial log"
  ON public.order_item_partial_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_role manage partial log"
  ON public.order_item_partial_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. RPC: toggle partial shipment
CREATE OR REPLACE FUNCTION public.toggle_item_partial_shipment(
  p_item_id uuid,
  p_enabled boolean,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text;
  v_order_id uuid;
  v_seller_id uuid;
  v_item_name text;
  v_order_number text;
  v_is_admin boolean;
  v_is_seller boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT oi.order_id, oi.description, o.seller_id, o.order_number
    INTO v_order_id, v_item_name, v_seller_id, v_order_number
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

  IF p_enabled THEN
    INSERT INTO public.seller_tasks(order_id, title, description, task_type, status, assigned_to)
    VALUES (
      v_order_id,
      'Envío parcial aprobado',
      'Se aprobó entrega parcial del ítem "' || COALESCE(v_item_name,'(sin nombre)') || '" de la orden ' || COALESCE(v_order_number,''),
      'production_notice',
      'pending',
      NULL
    );
    IF v_seller_id IS NOT NULL THEN
      INSERT INTO public.seller_tasks(order_id, title, description, task_type, status, assigned_to)
      VALUES (
        v_order_id,
        'Coordinar entrega parcial',
        'Coordinar entrega parcial de ítem "' || COALESCE(v_item_name,'(sin nombre)') || '" con el cliente',
        'follow_up',
        'pending',
        v_seller_id
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'enabled', p_enabled);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_item_partial_shipment(uuid, boolean, text) TO authenticated;

-- 4. Mark partial item as delivered
CREATE OR REPLACE FUNCTION public.mark_item_partial_delivered(
  p_item_id uuid,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text;
  v_order_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT order_id INTO v_order_id FROM public.order_items WHERE id = p_item_id;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'order item not found'; END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_actor;

  UPDATE public.order_items
     SET partial_delivered_at = now()
   WHERE id = p_item_id AND partial_shipment_enabled = true;

  INSERT INTO public.order_item_partial_log(order_id, order_item_id, action, actor_id, actor_email, note)
  VALUES (v_order_id, p_item_id, 'delivered', v_actor, v_email, p_note);

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_item_partial_delivered(uuid, text) TO authenticated;

-- 5. Helpers
CREATE OR REPLACE FUNCTION public.can_send_order_to_logistics(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.partial_shipment_enabled = false
      AND oi.production_finished_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_send_order_to_logistics(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_collect_final_balance(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND (
        (oi.partial_shipment_enabled = true AND oi.partial_delivered_at IS NULL)
        OR (oi.partial_shipment_enabled = false AND oi.production_finished_at IS NULL)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_collect_final_balance(uuid) TO authenticated;
