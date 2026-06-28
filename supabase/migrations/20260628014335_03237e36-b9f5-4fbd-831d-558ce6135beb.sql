
CREATE TABLE public.logistics_availability (
  date date PRIMARY KEY,
  available boolean NOT NULL DEFAULT true,
  note text,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.logistics_availability TO authenticated;
GRANT ALL ON public.logistics_availability TO service_role;

ALTER TABLE public.logistics_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_availability_all_authenticated"
  ON public.logistics_availability FOR SELECT TO authenticated USING (true);

CREATE POLICY "manage_availability_logistics_admin"
  ON public.logistics_availability FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistica'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistica'));

CREATE TRIGGER update_logistics_availability_updated_at
  BEFORE UPDATE ON public.logistics_availability
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.orders
  ADD COLUMN scheduled_logistics_date date,
  ADD COLUMN scheduled_logistics_by uuid REFERENCES auth.users(id),
  ADD COLUMN scheduled_logistics_at timestamptz;

-- Elegibilidad centralizada. NOTA: cuando se construya QA, agregar
--   AND o.qa_passed_at IS NOT NULL
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
      AND s.slug IN ('terminado','pendiente_por_logistica')
      AND GREATEST(o.total - COALESCE(o.advance_amount,0) - COALESCE(p.payments_total,0), 0) = 0
  );
$$;

REVOKE ALL ON FUNCTION public.invoice_can_schedule_logistics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoice_can_schedule_logistics(uuid) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.logistics_availability;
