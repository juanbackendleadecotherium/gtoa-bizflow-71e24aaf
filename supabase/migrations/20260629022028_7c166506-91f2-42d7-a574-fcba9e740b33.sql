CREATE OR REPLACE FUNCTION public.invoice_can_schedule_logistics(_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.orders o
    JOIN public.order_statuses s ON s.id = o.status_id
    LEFT JOIN (
      SELECT order_id, SUM(amount) AS payments_total
      FROM public.order_payments
      GROUP BY order_id
    ) p ON p.order_id = o.id
    WHERE o.id = _order_id
      AND s.slug IN ('pendiente-por-logistica','pendiente_por_logistica','terminado')
      AND GREATEST(o.total - COALESCE(o.advance_amount,0) - COALESCE(p.payments_total,0), 0) = 0
  );
$$;