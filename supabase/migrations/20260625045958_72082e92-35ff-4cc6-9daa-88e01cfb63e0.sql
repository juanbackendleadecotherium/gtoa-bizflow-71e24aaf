DROP POLICY IF EXISTS "oisp insert by brand writer" ON public.order_item_supplier_payments;

CREATE POLICY "oisp insert by brand writer"
ON public.order_item_supplier_payments
FOR INSERT
TO authenticated
WITH CHECK (
  can_write_brand(auth.uid(), brand_id)
  AND EXISTS (
    SELECT 1 FROM suppliers s
    WHERE s.id = order_item_supplier_payments.supplier_id
      AND s.brand_id = order_item_supplier_payments.brand_id
  )
  AND EXISTS (
    SELECT 1 FROM order_items oi
    WHERE oi.id = order_item_supplier_payments.order_item_id
      AND oi.order_id = order_item_supplier_payments.order_id
  )
);