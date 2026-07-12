
ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS invoice_ignore_above integer;

UPDATE public.brands
  SET invoice_ignore_above = 1000
  WHERE id = '880ed95d-a199-4f9d-bfda-d9f9866e275e';

DELETE FROM public.released_invoice_numbers
  WHERE brand_id = '880ed95d-a199-4f9d-bfda-d9f9866e275e';

DO $$
DECLARE
  v_brand uuid := '880ed95d-a199-4f9d-bfda-d9f9866e275e';
  v_map jsonb := jsonb_build_object(
    'MD-0005','MD-0006',
    'MD-0004','MD-0005',
    'MD-0003','MD-0004',
    'MD-0002','MD-0003',
    'MD-0001','MD-0002',
    'MD-1934','MD-0001'
  );
  k text;
  v text;
  v_order_id uuid;
BEGIN
  FOR k IN SELECT jsonb_object_keys(v_map) LOOP
    UPDATE public.orders           SET invoice_number = 'TMP-'||k WHERE brand_id = v_brand AND invoice_number = k;
    UPDATE public.invoices         SET invoice_number = 'TMP-'||k WHERE order_id IN (SELECT id FROM public.orders WHERE brand_id = v_brand AND invoice_number = 'TMP-'||k);
    UPDATE public.invoice_versions SET invoice_number = 'TMP-'||k WHERE order_id IN (SELECT id FROM public.orders WHERE brand_id = v_brand AND invoice_number = 'TMP-'||k);
  END LOOP;

  FOR k IN SELECT jsonb_object_keys(v_map) LOOP
    v := v_map->>k;
    SELECT id INTO v_order_id FROM public.orders WHERE brand_id = v_brand AND invoice_number = 'TMP-'||k;
    UPDATE public.orders           SET invoice_number = v WHERE id = v_order_id;
    UPDATE public.invoices         SET invoice_number = v WHERE order_id = v_order_id;
    UPDATE public.invoice_versions SET invoice_number = v WHERE order_id = v_order_id;

    INSERT INTO public.order_audit_log (order_id, action, entity, field, old_value, new_value)
    VALUES (v_order_id, 'invoice_number_renumbered', 'orders', 'invoice_number', to_jsonb(k), to_jsonb(v));
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.allocate_invoice_number(p_brand_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix text;
  v_cap int;
  v_num text;
  v_max int;
  v_pat text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('invoice_alloc:'||p_brand_id::text, 0));

  SELECT invoice_prefix, invoice_ignore_above INTO v_prefix, v_cap
  FROM public.brands WHERE id = p_brand_id;
  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Marca sin invoice_prefix configurado';
  END IF;

  v_pat := '^'||v_prefix||'-\d+$';

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

  SELECT COALESCE(MAX(n),0) INTO v_max FROM (
    SELECT (regexp_replace(invoice_number,'^'||v_prefix||'-',''))::int AS n
    FROM public.orders
    WHERE brand_id = p_brand_id AND invoice_number ~ v_pat
    UNION ALL
    SELECT (regexp_replace(invoice_number,'^'||v_prefix||'-',''))::int
    FROM public.released_invoice_numbers
    WHERE brand_id = p_brand_id AND invoice_number ~ v_pat
  ) s
  WHERE v_cap IS NULL OR s.n <= v_cap;

  RETURN v_prefix||'-'||lpad((v_max+1)::text,4,'0');
END;
$function$;
