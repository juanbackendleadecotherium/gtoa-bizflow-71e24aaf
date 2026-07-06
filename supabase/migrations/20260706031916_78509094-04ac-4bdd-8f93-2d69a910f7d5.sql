
-- 1) invoice_prefix estable por marca
ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS invoice_prefix text;

UPDATE public.brands SET invoice_prefix = COALESCE(invoice_prefix,
  CASE slug
    WHEN 'casa-diseno' THEN 'CD'
    WHEN 'montenegro-design' THEN 'MD'
    WHEN 'espacio-mobiliario' THEN 'EM'
    WHEN 'espacio-inmobiliario' THEN 'EM'
    WHEN 'getova' THEN 'GT'
    ELSE upper(substring(regexp_replace(name,'[^A-Za-z]','','g'),1,2))
  END
);

ALTER TABLE public.brands ALTER COLUMN invoice_prefix SET NOT NULL;

-- 2) Bolsa de folios liberados
CREATE TABLE IF NOT EXISTS public.released_invoice_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  released_from_order_id uuid,
  released_by uuid,
  released_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS released_inv_brand_idx
  ON public.released_invoice_numbers(brand_id);

GRANT SELECT ON public.released_invoice_numbers TO authenticated;
GRANT ALL ON public.released_invoice_numbers TO service_role;

ALTER TABLE public.released_invoice_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "view released by brand access" ON public.released_invoice_numbers;
CREATE POLICY "view released by brand access"
  ON public.released_invoice_numbers FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));

-- 3) Auditoría de cambios de marca
CREATE TABLE IF NOT EXISTS public.order_brand_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  old_brand_id uuid NOT NULL REFERENCES public.brands(id),
  new_brand_id uuid NOT NULL REFERENCES public.brands(id),
  old_invoice_number text,
  new_invoice_number text,
  old_order_number text,
  new_order_number text,
  reason text,
  changed_by uuid,
  changed_by_email text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_brand_change_order_idx
  ON public.order_brand_change_log(order_id);

GRANT SELECT ON public.order_brand_change_log TO authenticated;
GRANT ALL ON public.order_brand_change_log TO service_role;

ALTER TABLE public.order_brand_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "view brand change log by brand access" ON public.order_brand_change_log;
CREATE POLICY "view brand change log by brand access"
  ON public.order_brand_change_log FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), old_brand_id)
      OR public.has_brand_access(auth.uid(), new_brand_id));

-- 4) Unicidad de invoice_number por marca (parcial: sólo cuando no es null)
CREATE UNIQUE INDEX IF NOT EXISTS orders_brand_invoice_unique
  ON public.orders(brand_id, invoice_number)
  WHERE invoice_number IS NOT NULL;

-- 5) Función atómica para asignar el siguiente folio
CREATE OR REPLACE FUNCTION public.allocate_invoice_number(p_brand_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_num text;
  v_max int;
  v_pat text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('invoice_alloc:'||p_brand_id::text, 0));

  SELECT invoice_prefix INTO v_prefix FROM public.brands WHERE id = p_brand_id;
  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Marca sin invoice_prefix configurado';
  END IF;

  v_pat := '^'||v_prefix||'-\d+$';

  -- Bolsa de liberados: elegir el menor numérico
  SELECT invoice_number INTO v_num
  FROM public.released_invoice_numbers
  WHERE brand_id = p_brand_id
    AND invoice_number ~ v_pat
  ORDER BY (regexp_replace(invoice_number,'^'||v_prefix||'-',''))::int ASC
  LIMIT 1;

  IF v_num IS NOT NULL THEN
    DELETE FROM public.released_invoice_numbers
    WHERE brand_id = p_brand_id AND invoice_number = v_num;
    RETURN v_num;
  END IF;

  -- MAX(+1) considerando también huecos ya no reutilizables
  SELECT COALESCE(MAX(n),0) INTO v_max FROM (
    SELECT (regexp_replace(invoice_number,'^'||v_prefix||'-',''))::int AS n
    FROM public.orders
    WHERE brand_id = p_brand_id AND invoice_number ~ v_pat
    UNION ALL
    SELECT (regexp_replace(invoice_number,'^'||v_prefix||'-',''))::int
    FROM public.released_invoice_numbers
    WHERE brand_id = p_brand_id AND invoice_number ~ v_pat
  ) s;

  RETURN v_prefix||'-'||lpad((v_max+1)::text,4,'0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_invoice_number(uuid) TO authenticated;

-- 6) Trigger: si no viene invoice_number en un INSERT, se asigna
CREATE OR REPLACE FUNCTION public.assign_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR length(NEW.invoice_number) = 0 THEN
    NEW.invoice_number := public.allocate_invoice_number(NEW.brand_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_assign_invoice_number ON public.orders;
CREATE TRIGGER orders_assign_invoice_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_invoice_number();

-- 7) Cambio de marca de una venta (atómico, con auditoría)
CREATE OR REPLACE FUNCTION public.change_order_brand(
  p_order_id uuid,
  p_new_brand_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_brand uuid;
  v_old_invoice text;
  v_old_order text;
  v_new_invoice text;
  v_new_order text;
  v_new_slug text;
  v_yr text;
  v_next_seq int;
  uid uuid := auth.uid();
  uemail text;
BEGIN
  SELECT brand_id, invoice_number, order_number
    INTO v_old_brand, v_old_invoice, v_old_order
  FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_old_brand IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;
  IF v_old_brand = p_new_brand_id THEN
    RAISE EXCEPTION 'La marca destino es la misma que la actual';
  END IF;
  IF NOT public.can_write_brand(uid, v_old_brand) THEN
    RAISE EXCEPTION 'Sin permiso sobre la marca actual';
  END IF;
  IF NOT public.can_write_brand(uid, p_new_brand_id) THEN
    RAISE EXCEPTION 'Sin permiso sobre la marca destino';
  END IF;

  -- Liberar el folio actual devolviéndolo a la bolsa de la marca origen
  IF v_old_invoice IS NOT NULL AND length(v_old_invoice) > 0 THEN
    INSERT INTO public.released_invoice_numbers(
      brand_id, invoice_number, released_from_order_id, released_by
    ) VALUES (v_old_brand, v_old_invoice, p_order_id, uid)
    ON CONFLICT (brand_id, invoice_number) DO NOTHING;
  END IF;

  -- Asignar folio nuevo (prioriza bolsa de la marca destino)
  v_new_invoice := public.allocate_invoice_number(p_new_brand_id);

  -- Regenerar también order_number para que use el prefijo de la marca destino
  PERFORM pg_advisory_xact_lock(hashtextextended('order_number_alloc:'||p_new_brand_id::text, 0));
  SELECT upper(slug) INTO v_new_slug FROM public.brands WHERE id = p_new_brand_id;
  v_yr := to_char(now(),'YYYY');
  SELECT COALESCE(MAX(NULLIF(regexp_replace(order_number,'^'||v_new_slug||'-'||v_yr||'-',''),'')::int),0)+1
    INTO v_next_seq
  FROM public.orders
  WHERE brand_id = p_new_brand_id
    AND order_number LIKE v_new_slug||'-'||v_yr||'-%';
  v_new_order := v_new_slug||'-'||v_yr||'-'||lpad(v_next_seq::text,6,'0');

  UPDATE public.orders
     SET brand_id = p_new_brand_id,
         invoice_number = v_new_invoice,
         order_number = v_new_order,
         updated_at = now()
   WHERE id = p_order_id;

  SELECT email INTO uemail FROM public.profiles WHERE user_id = uid LIMIT 1;

  INSERT INTO public.order_brand_change_log(
    order_id, old_brand_id, new_brand_id,
    old_invoice_number, new_invoice_number,
    old_order_number, new_order_number,
    reason, changed_by, changed_by_email
  ) VALUES (
    p_order_id, v_old_brand, p_new_brand_id,
    v_old_invoice, v_new_invoice,
    v_old_order, v_new_order,
    p_reason, uid, uemail
  );

  RETURN jsonb_build_object(
    'invoice_number', v_new_invoice,
    'order_number', v_new_order,
    'released_invoice_number', v_old_invoice
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_order_brand(uuid,uuid,text) TO authenticated;
