
-- 1) Tighten brands SELECT: only users with access to that brand can read it.
DROP POLICY IF EXISTS "Authenticated can view brands" ON public.brands;
CREATE POLICY "Users can view brands they have access to"
  ON public.brands FOR SELECT
  TO authenticated
  USING (public.has_brand_access(auth.uid(), id));

-- 2) Invoices storage bucket: scope by brand_id encoded as first path segment.
DROP POLICY IF EXISTS "Authenticated view invoice files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload invoice files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update invoice files" ON storage.objects;

CREATE POLICY "Brand members view invoice files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoices'
    AND public.has_brand_access(
      auth.uid(),
      NULLIF(split_part(name, '/', 1), '')::uuid
    )
  );

CREATE POLICY "Brand writers upload invoice files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'invoices'
    AND public.can_write_brand(
      auth.uid(),
      NULLIF(split_part(name, '/', 1), '')::uuid
    )
  );

CREATE POLICY "Brand writers update invoice files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'invoices'
    AND public.can_write_brand(
      auth.uid(),
      NULLIF(split_part(name, '/', 1), '')::uuid
    )
  )
  WITH CHECK (
    bucket_id = 'invoices'
    AND public.can_write_brand(
      auth.uid(),
      NULLIF(split_part(name, '/', 1), '')::uuid
    )
  );

CREATE POLICY "Brand writers delete invoice files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'invoices'
    AND public.can_write_brand(
      auth.uid(),
      NULLIF(split_part(name, '/', 1), '')::uuid
    )
  );

-- 3) Order attachments bucket: keep public read disabled (prevent listing),
-- restrict writes to admin or ventas roles.
DROP POLICY IF EXISTS "order-attachments public read" ON storage.objects;
DROP POLICY IF EXISTS "order-attachments auth insert" ON storage.objects;
DROP POLICY IF EXISTS "order-attachments auth update" ON storage.objects;
DROP POLICY IF EXISTS "order-attachments auth delete" ON storage.objects;

-- Authenticated may list (public URLs still work via CDN regardless of RLS).
CREATE POLICY "order-attachments auth read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'order-attachments');

CREATE POLICY "order-attachments writers insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'order-attachments'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'ventas'::app_role)
    )
  );

CREATE POLICY "order-attachments writers update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'order-attachments'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'ventas'::app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'order-attachments'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'ventas'::app_role)
    )
  );

CREATE POLICY "order-attachments writers delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'order-attachments'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'ventas'::app_role)
    )
  );

-- 4) Revoke direct RPC EXECUTE on auth/role helper functions to prevent probing.
-- They remain callable from RLS / other SECURITY DEFINER functions.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_brand_access(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_write_brand(uuid, uuid) FROM PUBLIC, anon, authenticated;
