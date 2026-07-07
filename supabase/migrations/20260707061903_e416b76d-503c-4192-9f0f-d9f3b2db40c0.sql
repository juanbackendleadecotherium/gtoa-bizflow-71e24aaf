DROP POLICY IF EXISTS "Finance and sellers read tiers" ON public.commission_tiers;

CREATE POLICY "Finance and sellers read tiers"
ON public.commission_tiers
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'finanzas')
  OR public.has_role(auth.uid(), 'vendedor')
  OR public.has_role(auth.uid(), 'ventas')
);