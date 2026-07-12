-- Clean orphans first
DELETE FROM public.seller_tasks st
 WHERE st.order_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = st.order_id);

DELETE FROM public.seller_tasks st
 WHERE st.production_order_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.production_orders p WHERE p.id = st.production_order_id);

ALTER TABLE public.seller_tasks
  ADD CONSTRAINT seller_tasks_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE public.seller_tasks
  ADD CONSTRAINT seller_tasks_production_order_id_fkey
  FOREIGN KEY (production_order_id) REFERENCES public.production_orders(id) ON DELETE CASCADE;