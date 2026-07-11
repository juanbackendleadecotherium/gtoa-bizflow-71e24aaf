
CREATE OR REPLACE FUNCTION public.change_invoice_number(p_order_id uuid, p_new_invoice_number text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_brand_id uuid;
  v_old text;
  v_prefix text;
  v_pat text;
  v_new text;
  v_exists boolean;
BEGIN
  v_new := btrim(coalesce(p_new_invoice_number, ''));
  IF v_new = '' THEN
    RAISE EXCEPTION 'El número de cuenta de cobro no puede estar vacío';
  END IF;

  SELECT brand_id, invoice_number INTO v_brand_id, v_old
  FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;

  IF v_old IS NOT NULL AND v_old = v_new THEN
    RETURN v_new;
  END IF;

  SELECT invoice_prefix INTO v_prefix FROM public.brands WHERE id = v_brand_id;
  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'La marca no tiene prefijo configurado';
  END IF;
  v_pat := '^'||v_prefix||'-\d+$';
  IF v_new !~ v_pat THEN
    RAISE EXCEPTION 'El número debe seguir el formato %-NNNN', v_prefix;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('invoice_alloc:'||v_brand_id::text, 0));

  SELECT EXISTS (
    SELECT 1 FROM public.orders
    WHERE brand_id = v_brand_id
      AND invoice_number = v_new
      AND id <> p_order_id
  ) INTO v_exists;
  IF v_exists THEN
    RAISE EXCEPTION 'El número % ya está asignado a otra venta', v_new;
  END IF;

  -- Quitar el nuevo de la bolsa de liberados (si estaba)
  DELETE FROM public.released_invoice_numbers
  WHERE brand_id = v_brand_id AND invoice_number = v_new;

  -- Actualizar la venta
  UPDATE public.orders SET invoice_number = v_new WHERE id = p_order_id;

  -- Propagar a snapshots de cuentas de cobro
  UPDATE public.invoices SET invoice_number = v_new WHERE order_id = p_order_id;
  UPDATE public.invoice_versions SET invoice_number = v_new WHERE order_id = p_order_id;

  -- Liberar el anterior para reutilización
  IF v_old IS NOT NULL AND v_old ~ v_pat THEN
    INSERT INTO public.released_invoice_numbers (brand_id, invoice_number)
    VALUES (v_brand_id, v_old)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.change_invoice_number(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.change_invoice_number(uuid, text) TO authenticated, service_role;
