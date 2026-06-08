ALTER TABLE public.production_orders DROP CONSTRAINT IF EXISTS production_orders_status_check;
ALTER TABLE public.production_orders ADD CONSTRAINT production_orders_status_check
  CHECK (status = ANY (ARRAY['pendiente','en_proceso','control_calidad','listo','entregado','cancelado','rechazada']));