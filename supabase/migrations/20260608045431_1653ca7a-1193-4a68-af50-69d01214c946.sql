
CREATE OR REPLACE FUNCTION public.reject_production_with_reason(p_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Insert audit log FIRST so the trigger on production_orders can read the reason
  INSERT INTO public.production_audit_log(
    production_order_id, brand_id, action, field, old_value, new_value, note, changed_by, changed_by_email
  ) VALUES (
    p_id, v_brand, 'rejected', 'status', to_jsonb(v_old), to_jsonb('rechazada'::text),
    btrim(p_reason), v_uid, v_email
  );

  UPDATE public.production_orders SET status = 'rechazada' WHERE id = p_id;
END;
$function$;

-- Backfill existing pending fix_planimetry tasks that lost their reason due to the previous ordering
UPDATE public.seller_tasks st
SET reason = pal.note
FROM public.production_audit_log pal
WHERE st.production_order_id = pal.production_order_id
  AND pal.action = 'rejected'
  AND st.type = 'fix_planimetry'
  AND st.reason IS NULL
  AND pal.note IS NOT NULL;
