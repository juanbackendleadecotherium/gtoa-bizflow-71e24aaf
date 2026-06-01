
-- 1) Drop FK on order_audit_log to allow cascade deletes (trigger inserts during cascade caused FK violations)
ALTER TABLE public.order_audit_log DROP CONSTRAINT IF EXISTS order_audit_log_order_id_fkey;

-- 2) Create deletions log table (no FK to orders, must outlive the deleted order)
CREATE TABLE public.order_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  order_number text,
  invoice_number text,
  customer_name text,
  total numeric(14,2) NOT NULL DEFAULT 0,
  reason text NOT NULL,
  order_snapshot jsonb NOT NULL,
  items_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  deleted_by uuid,
  deleted_by_email text,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.order_deletions TO authenticated;
GRANT ALL ON public.order_deletions TO service_role;

ALTER TABLE public.order_deletions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View deletions by brand access"
  ON public.order_deletions FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));

CREATE POLICY "Insert deletions (admin or ventas)"
  ON public.order_deletions FOR INSERT TO authenticated
  WITH CHECK (public.can_write_brand(auth.uid(), brand_id));

CREATE INDEX idx_order_deletions_brand_date ON public.order_deletions (brand_id, deleted_at DESC);

-- 3) RPC: delete order with mandatory reason, snapshotting first
CREATE OR REPLACE FUNCTION public.delete_order_with_reason(p_order_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_order public.orders%ROWTYPE;
  v_items jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'La razón debe tener al menos 10 caracteres';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;

  IF NOT public.can_write_brand(v_uid, v_order.brand_id) THEN
    RAISE EXCEPTION 'No autorizado para eliminar esta venta';
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE user_id = v_uid LIMIT 1;

  SELECT COALESCE(jsonb_agg(to_jsonb(i.*) ORDER BY i.sort_order), '[]'::jsonb)
    INTO v_items FROM public.order_items i WHERE i.order_id = p_order_id;

  INSERT INTO public.order_deletions(
    order_id, brand_id, order_number, invoice_number, customer_name, total,
    reason, order_snapshot, items_snapshot, deleted_by, deleted_by_email
  ) VALUES (
    v_order.id, v_order.brand_id, v_order.order_number, v_order.invoice_number,
    v_order.customer_name, v_order.total,
    btrim(p_reason), to_jsonb(v_order), v_items, v_uid, v_email
  );

  -- Clean up children without FK cascade
  DELETE FROM public.order_payments WHERE order_id = p_order_id;
  DELETE FROM public.order_collection_followups WHERE order_id = p_order_id;

  -- Cascade deletes the rest (items, audit, status_history, invoices, invoice_versions)
  DELETE FROM public.orders WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_order_with_reason(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_order_with_reason(uuid, text) TO authenticated;
