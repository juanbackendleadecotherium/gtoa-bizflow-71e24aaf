-- 1) Deletion history table
CREATE TABLE IF NOT EXISTS public.production_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  order_id uuid,
  code text,
  status text,
  reason text NOT NULL,
  order_snapshot jsonb NOT NULL,
  planimetries_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  deleted_by uuid,
  deleted_by_email text,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.production_deletions TO authenticated;
GRANT ALL ON public.production_deletions TO service_role;

ALTER TABLE public.production_deletions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View production deletions by brand"
ON public.production_deletions FOR SELECT TO authenticated
USING (public.has_brand_access(auth.uid(), brand_id));

CREATE POLICY "Insert production deletions (admin only)"
ON public.production_deletions FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) Delete RPC — admin only, requires reason, snapshots everything
CREATE OR REPLACE FUNCTION public.delete_production_with_reason(p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_po public.production_orders%ROWTYPE;
  v_plans jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Solo administradores pueden eliminar órdenes de producción';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'El motivo debe tener al menos 10 caracteres';
  END IF;

  SELECT * INTO v_po FROM public.production_orders WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden de producción no encontrada'; END IF;

  SELECT email INTO v_email FROM public.profiles WHERE user_id = v_uid LIMIT 1;

  SELECT COALESCE(jsonb_agg(to_jsonb(pp.*) ORDER BY pp.version), '[]'::jsonb)
    INTO v_plans FROM public.production_planimetries pp WHERE pp.production_order_id = p_id;

  INSERT INTO public.production_deletions(
    production_order_id, brand_id, order_id, code, status, reason,
    order_snapshot, planimetries_snapshot, deleted_by, deleted_by_email
  ) VALUES (
    v_po.id, v_po.brand_id, v_po.order_id, v_po.code, v_po.status, btrim(p_reason),
    to_jsonb(v_po), v_plans, v_uid, v_email
  );

  -- Wipe audit and planimetries first to avoid the FK race; the audit FK is
  -- cascade but Postgres still validates during the trigger transactions.
  DELETE FROM public.production_audit_log WHERE production_order_id = p_id;
  DELETE FROM public.production_planimetries WHERE production_order_id = p_id;
  DELETE FROM public.production_orders WHERE id = p_id;
END;
$$;

-- 3) Reject RPC — keeps the order alive, marks as 'rechazada' and logs the reason
CREATE OR REPLACE FUNCTION public.reject_production_with_reason(p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_brand uuid;
  v_old text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'El motivo debe tener al menos 10 caracteres';
  END IF;

  SELECT brand_id, status INTO v_brand, v_old FROM public.production_orders WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden de producción no encontrada'; END IF;
  IF NOT public.can_write_brand(v_uid, v_brand) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE user_id = v_uid LIMIT 1;

  UPDATE public.production_orders SET status = 'rechazada' WHERE id = p_id;

  INSERT INTO public.production_audit_log(
    production_order_id, brand_id, action, field, old_value, new_value, note, changed_by, changed_by_email
  ) VALUES (
    p_id, v_brand, 'rejected', 'status', to_jsonb(v_old), to_jsonb('rechazada'::text),
    btrim(p_reason), v_uid, v_email
  );
END;
$$;