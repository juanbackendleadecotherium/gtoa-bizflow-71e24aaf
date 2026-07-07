
-- production_planimetries: permitir INSERT/UPDATE al rol operativo con acceso a la marca
DROP POLICY IF EXISTS "Insert planimetries (production)" ON public.production_planimetries;
CREATE POLICY "Insert planimetries (production)"
  ON public.production_planimetries
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'operativo'::app_role)
    AND has_brand_access(auth.uid(), brand_id)
  );

DROP POLICY IF EXISTS "Update planimetries (production)" ON public.production_planimetries;
CREATE POLICY "Update planimetries (production)"
  ON public.production_planimetries
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'operativo'::app_role)
    AND has_brand_access(auth.uid(), brand_id)
  );

-- suppliers: permitir INSERT/UPDATE al rol operativo con acceso a la marca
DROP POLICY IF EXISTS "Insert suppliers (production)" ON public.suppliers;
CREATE POLICY "Insert suppliers (production)"
  ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'operativo'::app_role)
    AND has_brand_access(auth.uid(), brand_id)
  );

DROP POLICY IF EXISTS "Update suppliers (production)" ON public.suppliers;
CREATE POLICY "Update suppliers (production)"
  ON public.suppliers
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'operativo'::app_role)
    AND has_brand_access(auth.uid(), brand_id)
  );

-- order_items: producción puede actualizar los ítems que ya están en una OP de su marca
-- (costo real, proveedor, fechas de entrega, estado, etc.). No permite crear ni borrar ítems.
DROP POLICY IF EXISTS "Update order items (production)" ON public.order_items;
CREATE POLICY "Update order items (production)"
  ON public.order_items
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'operativo'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.orders o
       WHERE o.id = order_items.order_id
         AND has_brand_access(auth.uid(), o.brand_id)
    )
  );
