CREATE OR REPLACE FUNCTION public.order_items_auto_item_quotation_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.supplier_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.supplier_id IS DISTINCT FROM NEW.supplier_id)
     AND NEW.quotation_date IS NULL THEN
    NEW.quotation_date := current_date;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS order_items_set_item_quotation_date ON public.order_items;
CREATE TRIGGER order_items_set_item_quotation_date
BEFORE INSERT OR UPDATE OF supplier_id ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.order_items_auto_item_quotation_date();