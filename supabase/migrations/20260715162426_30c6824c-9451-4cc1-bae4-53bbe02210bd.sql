DROP POLICY IF EXISTS "Insert payments (admin, finanzas or ventas)" ON public.order_payments;

CREATE POLICY "Insert payments (admin, finanzas, ventas or vendedor)"
ON public.order_payments
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'finanzas'::app_role)
  OR (has_role(auth.uid(), 'ventas'::app_role) AND has_brand_access(auth.uid(), brand_id))
  OR (has_role(auth.uid(), 'vendedor'::app_role) AND has_brand_access(auth.uid(), brand_id))
);