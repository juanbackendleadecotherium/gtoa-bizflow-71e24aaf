
-- 1) Permitir pasar una fecha explícita al marcar terminado
CREATE OR REPLACE FUNCTION public.mark_order_item_finished(_item_id uuid, _finished_at timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
     SET production_finished_at = COALESCE(_finished_at, now()),
         production_finished_by = v_uid,
         production_finished_by_email = v_email
   WHERE id = _item_id
     AND production_finished_at IS NULL;
END;
$function$;

-- 2) Editar fecha de inicio de producción ya registrada (misma auth que finish)
CREATE OR REPLACE FUNCTION public.update_order_item_started_at(_item_id uuid, _started_at timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT public.can_finish_order_item(v_uid, _item_id) THEN
    RAISE EXCEPTION 'No autorizado para editar fechas de este producto';
  END IF;
  IF _started_at IS NULL THEN
    RAISE EXCEPTION 'La fecha de inicio no puede ser vacía';
  END IF;
  UPDATE public.order_items
     SET production_started_at = _started_at
   WHERE id = _item_id;
END;
$function$;

-- 3) Editar fecha de terminado ya registrada (para correcciones)
CREATE OR REPLACE FUNCTION public.update_order_item_finished_at(_item_id uuid, _finished_at timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT public.can_finish_order_item(v_uid, _item_id) THEN
    RAISE EXCEPTION 'No autorizado para editar fechas de este producto';
  END IF;
  IF _finished_at IS NULL THEN
    RAISE EXCEPTION 'La fecha de terminado no puede ser vacía';
  END IF;
  UPDATE public.order_items
     SET production_finished_at = _finished_at
   WHERE id = _item_id
     AND production_finished_at IS NOT NULL;
END;
$function$;
