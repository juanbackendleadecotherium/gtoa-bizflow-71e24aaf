
-- 1) Suppliers flags
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS requires_advance_payment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS advance_payment_pct numeric(5,2) NOT NULL DEFAULT 50
    CHECK (advance_payment_pct >= 0 AND advance_payment_pct <= 100);

UPDATE public.suppliers
   SET requires_advance_payment = true
 WHERE lower(name) = 'ebanistería' OR lower(name) = 'ebanisteria';

-- 2) Order item supplier payments
CREATE TABLE IF NOT EXISTS public.order_item_supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL UNIQUE REFERENCES public.order_items(id) ON DELETE CASCADE,
  production_order_id uuid REFERENCES public.production_orders(id) ON DELETE SET NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  supplier_name_snapshot text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_at date NOT NULL,
  receipt_path text NOT NULL,
  receipt_mime text,
  receipt_size_bytes integer,
  created_by uuid,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oisp_brand_idx ON public.order_item_supplier_payments(brand_id);
CREATE INDEX IF NOT EXISTS oisp_order_idx ON public.order_item_supplier_payments(order_id);
CREATE INDEX IF NOT EXISTS oisp_production_idx ON public.order_item_supplier_payments(production_order_id);

GRANT SELECT, INSERT ON public.order_item_supplier_payments TO authenticated;
GRANT ALL ON public.order_item_supplier_payments TO service_role;

ALTER TABLE public.order_item_supplier_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oisp select by brand access"
  ON public.order_item_supplier_payments
  FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));

CREATE POLICY "oisp insert by brand writer"
  ON public.order_item_supplier_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_brand(auth.uid(), brand_id)
    AND EXISTS (
      SELECT 1 FROM public.suppliers s
       WHERE s.id = supplier_id
         AND s.requires_advance_payment = true
         AND s.brand_id = order_item_supplier_payments.brand_id
    )
    AND EXISTS (
      SELECT 1 FROM public.order_items oi
       WHERE oi.id = order_item_id
         AND oi.order_id = order_item_supplier_payments.order_id
    )
  );

DROP TRIGGER IF EXISTS trg_oisp_updated_at ON public.order_item_supplier_payments;
CREATE TRIGGER trg_oisp_updated_at
  BEFORE UPDATE ON public.order_item_supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.order_item_supplier_payments;
ALTER TABLE public.order_item_supplier_payments REPLICA IDENTITY FULL;

-- 3) Effective production-start helper (single source of truth)
CREATE OR REPLACE FUNCTION public.effective_production_start_for_item(_item_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN s.requires_advance_payment IS TRUE THEN
      (SELECT (p.paid_at::timestamptz)
         FROM public.order_item_supplier_payments p
        WHERE p.order_item_id = _item_id)
    ELSE now()
  END
  FROM public.order_items oi
  LEFT JOIN public.suppliers s ON s.id = oi.supplier_id
  WHERE oi.id = _item_id;
$$;

GRANT EXECUTE ON FUNCTION public.effective_production_start_for_item(uuid) TO authenticated;

-- 4) start_real_production v2: accepts optional effective timestamp
DROP FUNCTION IF EXISTS public.start_real_production(uuid);

CREATE OR REPLACE FUNCTION public.start_real_production(
  p_item_id uuid,
  p_started_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_item public.order_items%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_po public.production_orders%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
  v_remaining int;
  v_title text;
  v_reason text;
  v_started timestamptz;
  v_due date;
BEGIN
  SELECT * INTO v_item FROM public.order_items WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
  IF v_item.production_started_at IS NOT NULL THEN
    RETURN; -- idempotente
  END IF;

  -- Resolve effective start
  IF p_started_at IS NOT NULL THEN
    v_started := p_started_at;
  ELSE
    v_started := public.effective_production_start_for_item(p_item_id);
  END IF;
  IF v_started IS NULL THEN
    RAISE EXCEPTION 'No se puede iniciar producción: el proveedor requiere pago anticipado y aún no se ha registrado.';
  END IF;

  UPDATE public.order_items SET production_started_at = v_started WHERE id = p_item_id;

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id;
  IF v_item.supplier_id IS NOT NULL THEN
    SELECT * INTO v_supplier FROM public.suppliers WHERE id = v_item.supplier_id;
  END IF;
  IF v_item.production_order_id IS NOT NULL THEN
    SELECT * INTO v_po FROM public.production_orders WHERE id = v_item.production_order_id;
  END IF;

  -- Refresh production_due_date for this item from the current estimated delivery
  -- (entrega cliente − 3 días hábiles). Keeps tracking dates honest when the
  -- delivery date has moved between "enviar a producción" and the actual start.
  IF v_order.estimated_delivery_date IS NOT NULL THEN
    SELECT (public.add_business_days(v_order.estimated_delivery_date::timestamptz, 0)::date)
      INTO v_due;
    -- subtract 3 business days by walking back
    DECLARE
      d date := v_order.estimated_delivery_date;
      n int := 3;
    BEGIN
      WHILE n > 0 LOOP
        d := d - 1;
        IF EXTRACT(ISODOW FROM d) < 6 THEN
          n := n - 1;
        END IF;
      END LOOP;
      v_due := d;
    END;
    UPDATE public.order_items SET production_due_date = v_due WHERE id = p_item_id;
  END IF;

  IF v_order.seller_id IS NOT NULL THEN
    v_title := 'Tu producto empezó a producirse';
    v_reason := 'Ítem ' || COALESCE(split_part(v_item.description, E'\n', 1), 'Producto') ||
                ' inició producción' ||
                CASE WHEN v_supplier.name IS NOT NULL THEN ' con ' || v_supplier.name ELSE '' END ||
                '. Fecha estimada de entrega: ' ||
                COALESCE(to_char(v_order.estimated_delivery_date, 'DD/MM/YYYY'),
                         to_char(v_due, 'DD/MM/YYYY'),
                         'por definir') ||
                CASE WHEN v_order.invoice_number IS NOT NULL
                     THEN ' · Fact. ' || v_order.invoice_number
                     ELSE ' · ' || COALESCE(v_order.order_number, '') END;
    INSERT INTO public.seller_tasks(
      seller_id, order_id, production_order_id, order_item_id, brand_id,
      type, title, reason, severity, status
    ) VALUES (
      v_order.seller_id, v_order.id, v_item.production_order_id, v_item.id, v_order.brand_id,
      'production_started', v_title, v_reason, 'info', 'pendiente'
    );
  END IF;

  IF v_item.production_order_id IS NOT NULL THEN
    SELECT count(*) INTO v_remaining
      FROM public.order_items
     WHERE production_order_id = v_item.production_order_id
       AND production_started_at IS NULL;
    IF v_remaining = 0 AND v_po.production_start_date IS NULL THEN
      UPDATE public.production_orders
         SET production_start_date = v_started::date
       WHERE id = v_item.production_order_id;
    END IF;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.start_real_production(uuid, timestamptz) TO authenticated;

-- 5) Guard: don't allow changing supplier on an item with a confirmed advance payment
CREATE OR REPLACE FUNCTION public.prevent_supplier_change_after_advance_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_snap text;
BEGIN
  IF NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN
    SELECT supplier_name_snapshot INTO v_snap
      FROM public.order_item_supplier_payments
     WHERE order_item_id = OLD.id;
    IF v_snap IS NOT NULL THEN
      RAISE EXCEPTION 'No se puede cambiar el proveedor: este ítem ya tiene un pago anticipado confirmado a %. Gestiona el reembolso fuera del sistema.', v_snap
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_oi_prevent_supplier_change_after_payment ON public.order_items;
CREATE TRIGGER trg_oi_prevent_supplier_change_after_payment
  BEFORE UPDATE OF supplier_id ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_supplier_change_after_advance_payment();

-- 6) Storage policies for supplier-payments bucket
-- Path layout: {brand_id}/{order_id}/{order_item_id}/{uuid}.{ext}
CREATE POLICY "supplier-payments select by brand access"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'supplier-payments'
    AND public.has_brand_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "supplier-payments insert by brand writer"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'supplier-payments'
    AND public.can_write_brand(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
