-- 1. Extender can_write_brand para incluir vendedor con acceso a la marca
CREATE OR REPLACE FUNCTION public.can_write_brand(_user_id uuid, _brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR (public.has_role(_user_id, 'ventas')   AND public.has_brand_access(_user_id, _brand_id))
    OR (public.has_role(_user_id, 'vendedor') AND public.has_brand_access(_user_id, _brand_id));
$$;

-- 2. Restringir escrituras sensibles que ahora quedarían abiertas al vendedor

-- 2a. order_payments: sólo admin / finanzas / ventas (ventas con acceso a marca)
DROP POLICY IF EXISTS "Insert payments (admin or ventas)" ON public.order_payments;
CREATE POLICY "Insert payments (admin, finanzas or ventas)"
ON public.order_payments FOR INSERT
TO authenticated
WITH CHECK (
  (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'finanzas')
    OR (public.has_role(auth.uid(), 'ventas') AND public.has_brand_access(auth.uid(), brand_id))
  )
);

-- 2b. production_orders: excluir vendedor puro de INSERT/UPDATE
DROP POLICY IF EXISTS "Insert production (admin or ventas)" ON public.production_orders;
CREATE POLICY "Insert production (admin, ventas or operativo)"
ON public.production_orders FOR INSERT
TO authenticated
WITH CHECK (
  NOT public.is_pure_vendedor(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'ventas')    AND public.has_brand_access(auth.uid(), brand_id))
    OR (public.has_role(auth.uid(), 'operativo') AND public.has_brand_access(auth.uid(), brand_id))
  )
);

DROP POLICY IF EXISTS "Update production (admin or ventas)" ON public.production_orders;
CREATE POLICY "Update production (admin, ventas or operativo)"
ON public.production_orders FOR UPDATE
TO authenticated
USING (
  NOT public.is_pure_vendedor(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'ventas')    AND public.has_brand_access(auth.uid(), brand_id))
    OR (public.has_role(auth.uid(), 'operativo') AND public.has_brand_access(auth.uid(), brand_id))
  )
);

-- 3. Trigger salvavidas: al insertar orders, si seller_id es null, usar auth.uid()
CREATE OR REPLACE FUNCTION public.orders_set_default_seller()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.seller_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.seller_id := auth.uid();
  END IF;
  IF NEW.created_by IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_set_default_seller_trg ON public.orders;
CREATE TRIGGER orders_set_default_seller_trg
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_set_default_seller();