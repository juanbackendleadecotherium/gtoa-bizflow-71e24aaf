
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS manufacturing_cost numeric(14,2),
  ADD COLUMN IF NOT EXISTS margin_pct numeric(6,2),
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_notes text;

CREATE OR REPLACE FUNCTION public.compute_order_item_margin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_line numeric;
BEGIN
  v_line := COALESCE(NEW.quantity, 0) * COALESCE(NEW.unit_price, 0);
  IF NEW.manufacturing_cost IS NOT NULL AND v_line > 0 THEN
    NEW.margin_pct := round(((v_line - NEW.manufacturing_cost) / v_line) * 100, 2);
  ELSE
    NEW.margin_pct := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_order_item_margin ON public.order_items;
CREATE TRIGGER trg_compute_order_item_margin
BEFORE INSERT OR UPDATE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.compute_order_item_margin();
