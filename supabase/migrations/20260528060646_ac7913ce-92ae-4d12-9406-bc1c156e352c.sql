CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note text;
BEGIN
  v_note := nullif(current_setting('app.status_note', true), '');
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_status_history (order_id, from_status_id, to_status_id, changed_by, note)
    VALUES (NEW.id, NULL, NEW.status_id, NEW.created_by, COALESCE(v_note, 'Pedido creado'));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.status_id IS DISTINCT FROM OLD.status_id THEN
    INSERT INTO public.order_status_history (order_id, from_status_id, to_status_id, changed_by, note)
    VALUES (NEW.id, OLD.status_id, NEW.status_id, auth.uid(), v_note);
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id uuid,
  p_status_id uuid,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.status_note', COALESCE(p_note, ''), true);
  UPDATE public.orders SET status_id = p_status_id WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_order_status(uuid, uuid, text) TO authenticated;