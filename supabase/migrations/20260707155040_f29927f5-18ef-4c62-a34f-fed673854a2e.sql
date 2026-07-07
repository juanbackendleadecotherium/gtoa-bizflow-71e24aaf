-- Allow sellers/admins with write access to the brand to delete planimetries
DROP POLICY IF EXISTS "Delete planimetries (admin only)" ON public.production_planimetries;

CREATE POLICY "Delete planimetries (admin or ventas)"
ON public.production_planimetries
FOR DELETE
TO authenticated
USING (can_write_brand(auth.uid(), brand_id));

CREATE POLICY "Delete planimetries (production)"
ON public.production_planimetries
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'operativo'::app_role) AND has_brand_access(auth.uid(), brand_id));