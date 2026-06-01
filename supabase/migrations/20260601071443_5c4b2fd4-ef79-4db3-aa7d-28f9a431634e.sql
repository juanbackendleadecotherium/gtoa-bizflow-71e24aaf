ALTER TABLE public.production_orders
  ADD CONSTRAINT production_orders_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
ALTER TABLE public.production_orders
  ADD CONSTRAINT production_orders_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;
ALTER TABLE public.production_audit_log
  ADD CONSTRAINT production_audit_log_production_order_id_fkey FOREIGN KEY (production_order_id) REFERENCES public.production_orders(id) ON DELETE CASCADE;
NOTIFY pgrst, 'reload schema';