
DROP POLICY IF EXISTS "Insert production (admin, ventas or operativo)" ON public.production_orders;
DROP POLICY IF EXISTS "Update production (admin, ventas or operativo)" ON public.production_orders;

CREATE POLICY "Insert production (admin, ventas, vendedor or operativo)"
ON public.production_orders FOR INSERT TO authenticated
WITH CHECK (
  can_write_brand(auth.uid(), brand_id)
  OR (has_role(auth.uid(), 'operativo'::app_role) AND has_brand_access(auth.uid(), brand_id))
);

CREATE POLICY "Update production (admin, ventas, vendedor or operativo)"
ON public.production_orders FOR UPDATE TO authenticated
USING (
  can_write_brand(auth.uid(), brand_id)
  OR (has_role(auth.uid(), 'operativo'::app_role) AND has_brand_access(auth.uid(), brand_id))
)
WITH CHECK (
  can_write_brand(auth.uid(), brand_id)
  OR (has_role(auth.uid(), 'operativo'::app_role) AND has_brand_access(auth.uid(), brand_id))
);
