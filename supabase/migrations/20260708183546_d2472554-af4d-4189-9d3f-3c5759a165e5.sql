
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS parent_item_id UUID NULL
  REFERENCES public.order_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_parent_item_id
  ON public.order_items(parent_item_id);

CREATE OR REPLACE FUNCTION public.validate_order_item_parent()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_order UUID;
  parent_parent UUID;
  child_count INT;
BEGIN
  IF NEW.parent_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_item_id = NEW.id THEN
    RAISE EXCEPTION 'Un producto no puede ser su propio padre';
  END IF;

  SELECT order_id, parent_item_id INTO parent_order, parent_parent
  FROM public.order_items
  WHERE id = NEW.parent_item_id;

  IF parent_order IS NULL THEN
    RAISE EXCEPTION 'El producto padre no existe';
  END IF;

  IF parent_order <> NEW.order_id THEN
    RAISE EXCEPTION 'El producto padre debe pertenecer a la misma orden';
  END IF;

  IF parent_parent IS NOT NULL THEN
    RAISE EXCEPTION 'Solo se permite un nivel de anidamiento (el padre no puede ser hijo de otro)';
  END IF;

  -- Si este ítem ya tiene hijos, no puede convertirse en hijo
  SELECT COUNT(*) INTO child_count
  FROM public.order_items
  WHERE parent_item_id = NEW.id;

  IF child_count > 0 THEN
    RAISE EXCEPTION 'Este producto ya tiene hijos vinculados; no puede a su vez ser hijo';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_order_item_parent ON public.order_items;
CREATE TRIGGER trg_validate_order_item_parent
BEFORE INSERT OR UPDATE OF parent_item_id ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.validate_order_item_parent();
