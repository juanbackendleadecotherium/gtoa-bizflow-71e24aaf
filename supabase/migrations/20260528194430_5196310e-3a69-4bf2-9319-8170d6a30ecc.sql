
CREATE OR REPLACE FUNCTION public.recalc_order_total_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.total := COALESCE(NEW.subtotal, 0) - COALESCE(NEW.discount, 0) + COALESCE(NEW.tax, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_recalc_total ON public.orders;
CREATE TRIGGER orders_recalc_total
BEFORE INSERT OR UPDATE OF subtotal, discount, tax ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.recalc_order_total_on_change();

-- Backfill totales existentes
UPDATE public.orders
SET total = COALESCE(subtotal,0) - COALESCE(discount,0) + COALESCE(tax,0);
