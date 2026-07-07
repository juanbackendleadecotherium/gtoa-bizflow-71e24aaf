
-- Backfill: para cada OP pendiente existente, crea la tarea de revisión
INSERT INTO public.seller_tasks (
  seller_id, order_id, production_order_id, brand_id,
  type, title, reason, severity, status
)
SELECT DISTINCT
  ur.user_id,
  po.order_id,
  po.id,
  po.brand_id,
  'production_review_op',
  'Nueva orden de producción para revisar',
  format('%s cargó la OP de la venta %s. Revisa la planimetría y acéptala o recházala.',
         COALESCE(p.display_name, p.email, 'Vendedor'),
         COALESCE(o.invoice_number, o.order_number, '')),
  'warning',
  'pendiente'
FROM public.production_orders po
JOIN public.orders o ON o.id = po.order_id
LEFT JOIN public.profiles p ON p.user_id = o.seller_id
JOIN public.user_roles ur ON ur.role = 'operativo'
JOIN public.user_brands ub ON ub.user_id = ur.user_id AND ub.brand_id = po.brand_id
WHERE po.status = 'pendiente'
  AND NOT EXISTS (
    SELECT 1 FROM public.seller_tasks t
     WHERE t.seller_id = ur.user_id
       AND t.production_order_id = po.id
       AND t.type = 'production_review_op'
       AND t.status = 'pendiente'
  );
