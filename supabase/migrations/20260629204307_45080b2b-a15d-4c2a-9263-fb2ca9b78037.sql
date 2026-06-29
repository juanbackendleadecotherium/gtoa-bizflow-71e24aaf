-- Add negotiated cost fields to order_items
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS negotiated_cost numeric NULL,
  ADD COLUMN IF NOT EXISTS negotiated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS negotiated_by uuid NULL;

-- Update margin recalculation to use negotiated_cost when present
CREATE OR REPLACE FUNCTION public.order_items_recalc_margin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  effective_cost numeric;
BEGIN
  effective_cost := COALESCE(NEW.negotiated_cost, NEW.manufacturing_cost);
  IF effective_cost IS NOT NULL AND NEW.line_total IS NOT NULL AND NEW.line_total > 0 THEN
    NEW.margin_pct := ((NEW.line_total - effective_cost) / NEW.line_total) * 100;
  ELSE
    NEW.margin_pct := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_recalc_margin ON public.order_items;
CREATE TRIGGER trg_order_items_recalc_margin
  BEFORE INSERT OR UPDATE OF manufacturing_cost, negotiated_cost, line_total, unit_price, quantity
  ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.order_items_recalc_margin();
