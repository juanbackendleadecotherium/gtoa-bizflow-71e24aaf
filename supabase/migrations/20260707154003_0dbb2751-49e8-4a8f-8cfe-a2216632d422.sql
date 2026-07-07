
CREATE OR REPLACE FUNCTION public.resubmit_production_after_rejection(p_id uuid, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_brand uuid;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 10 THEN
    RAISE EXCEPTION 'Describe qué corregiste (mínimo 10 caracteres) para que producción lo revise.';
  END IF;

  SELECT brand_id, status INTO v_brand, v_status
    FROM public.production_orders WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden de producción no encontrada'; END IF;
  IF NOT public.can_write_brand(v_uid, v_brand) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF v_status <> 'rechazada' THEN
    RAISE EXCEPTION 'Sólo puedes reenviar una orden que esté en estado Rechazada.';
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE user_id = v_uid LIMIT 1;

  INSERT INTO public.production_audit_log(
    production_order_id, brand_id, action, field, old_value, new_value, note,
    changed_by, changed_by_email
  ) VALUES (
    p_id, v_brand, 'resubmitted', 'status',
    to_jsonb(v_status), to_jsonb('pendiente'::text),
    btrim(p_note), v_uid, v_email
  );

  UPDATE public.production_orders
     SET status = 'pendiente', updated_at = now()
   WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resubmit_production_after_rejection(uuid, text) TO authenticated;

-- Data fix: re-enqueue Claudia's already-corrected order so Alejandra sees it again
INSERT INTO public.production_audit_log(
  production_order_id, brand_id, action, field, old_value, new_value, note, changed_by, changed_by_email
)
SELECT id, brand_id, 'resubmitted', 'status',
       to_jsonb('rechazada'::text), to_jsonb('pendiente'::text),
       'Reactivada por soporte: la vendedora ya envió las correcciones solicitadas.',
       NULL, 'sistema'
FROM public.production_orders
WHERE id = '40430bf5-d628-4b9c-932c-b937165d1880' AND status = 'rechazada';

UPDATE public.production_orders
   SET status = 'pendiente', updated_at = now()
 WHERE id = '40430bf5-d628-4b9c-932c-b937165d1880' AND status = 'rechazada';
