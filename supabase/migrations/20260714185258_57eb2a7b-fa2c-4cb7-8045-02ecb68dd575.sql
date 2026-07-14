-- Rewrite storage.objects policies for the "order-attachments" bucket so
-- that the `vendedor` role can also upload / update / delete files, the
-- same way admin and ventas already could. RLS on orders / order_items
-- keeps controlling which orders they can touch inside the app; the bucket
-- policy only needs to authorize the write itself.

DROP POLICY IF EXISTS "order-attachments writers insert" ON storage.objects;
DROP POLICY IF EXISTS "order-attachments writers update" ON storage.objects;
DROP POLICY IF EXISTS "order-attachments writers delete" ON storage.objects;

CREATE POLICY "order-attachments writers insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'order-attachments'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'ventas'::public.app_role)
      OR public.has_role(auth.uid(), 'vendedor'::public.app_role)
    )
  );

CREATE POLICY "order-attachments writers update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'order-attachments'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'ventas'::public.app_role)
      OR public.has_role(auth.uid(), 'vendedor'::public.app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'order-attachments'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'ventas'::public.app_role)
      OR public.has_role(auth.uid(), 'vendedor'::public.app_role)
    )
  );

CREATE POLICY "order-attachments writers delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'order-attachments'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'ventas'::public.app_role)
      OR public.has_role(auth.uid(), 'vendedor'::public.app_role)
    )
  );