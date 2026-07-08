
-- Auto-finish an order_item when all its phases become 'terminado'
CREATE OR REPLACE FUNCTION public.auto_finish_item_on_phases_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _item_id uuid;
  _total int;
  _done int;
BEGIN
  _item_id := COALESCE(NEW.order_item_id, OLD.order_item_id);
  IF _item_id IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'terminado')
    INTO _total, _done
  FROM public.order_item_phases
  WHERE order_item_id = _item_id;

  IF _total > 0 AND _done = _total THEN
    UPDATE public.order_items
       SET production_finished_at = COALESCE(production_finished_at, now()),
           production_finished_by = COALESCE(production_finished_by, auth.uid()),
           production_finished_by_email = COALESCE(production_finished_by_email,
             (SELECT email FROM auth.users WHERE id = auth.uid()))
     WHERE id = _item_id
       AND production_finished_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_finish_item_on_phases ON public.order_item_phases;
CREATE TRIGGER trg_auto_finish_item_on_phases
AFTER INSERT OR UPDATE OF status OR DELETE
ON public.order_item_phases
FOR EACH ROW EXECUTE FUNCTION public.auto_finish_item_on_phases_complete();
