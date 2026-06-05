ALTER TABLE public.order_items
  ADD COLUMN production_order_id uuid
  REFERENCES public.production_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS order_items_production_order_id_idx
  ON public.order_items(production_order_id);