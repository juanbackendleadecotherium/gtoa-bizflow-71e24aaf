
-- Helper: true unless the user is a "pure vendedor" (vendedor role without admin/ventas/finanzas)
CREATE OR REPLACE FUNCTION public.is_pure_vendedor(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'vendedor')
     AND NOT public.has_role(_user_id, 'admin')
     AND NOT public.has_role(_user_id, 'ventas')
     AND NOT public.has_role(_user_id, 'finanzas');
$$;

-- Helper: vendedor visibility check for a given order id (via its seller_id)
CREATE OR REPLACE FUNCTION public.vendedor_can_see_order(_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.is_pure_vendedor(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = _order_id AND o.seller_id = auth.uid()
      );
$$;

-- ORDERS: replace SELECT policy so pure vendedor only sees own orders
DROP POLICY IF EXISTS "View orders by brand access" ON public.orders;
CREATE POLICY "View orders by brand access"
ON public.orders FOR SELECT
USING (
  has_brand_access(auth.uid(), brand_id)
  AND (NOT public.is_pure_vendedor(auth.uid()) OR seller_id = auth.uid())
);

-- INVOICES
DROP POLICY IF EXISTS "View invoices by brand access" ON public.invoices;
CREATE POLICY "View invoices by brand access"
ON public.invoices FOR SELECT
USING (
  has_brand_access(auth.uid(), brand_id)
  AND public.vendedor_can_see_order(order_id)
);

-- ORDER_PAYMENTS (has order_id + brand_id)
DROP POLICY IF EXISTS "View payments by brand access" ON public.order_payments;
CREATE POLICY "View payments by brand access"
ON public.order_payments FOR SELECT
USING (
  has_brand_access(auth.uid(), brand_id)
  AND public.vendedor_can_see_order(order_id)
);

-- ORDER_DELETIONS (has deleted_by directly)
DROP POLICY IF EXISTS "View deletions by brand access" ON public.order_deletions;
CREATE POLICY "View deletions by brand access"
ON public.order_deletions FOR SELECT
USING (
  has_brand_access(auth.uid(), brand_id)
  AND (NOT public.is_pure_vendedor(auth.uid()) OR deleted_by = auth.uid())
);

-- COMMISSION_TIERS: restrict SELECT to admin + finanzas (was public authenticated)
DROP POLICY IF EXISTS "All authenticated can read tiers" ON public.commission_tiers;
CREATE POLICY "Admin and finanzas read tiers"
ON public.commission_tiers FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'finanzas')
);
