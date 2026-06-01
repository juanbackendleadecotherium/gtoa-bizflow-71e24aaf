-- 1. Extend brands with billing fields
ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS invoice_footer_note text;

-- 2. Terms versions (global)
CREATE TABLE public.terms_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL,
  title text NOT NULL DEFAULT 'Términos y Condiciones de Venta',
  content_html text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version)
);

GRANT SELECT ON public.terms_versions TO authenticated;
GRANT ALL ON public.terms_versions TO service_role;

ALTER TABLE public.terms_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view terms"
  ON public.terms_versions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins insert terms"
  ON public.terms_versions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update terms"
  ON public.terms_versions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete terms"
  ON public.terms_versions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Auto-deactivate prior versions when one is set active
CREATE OR REPLACE FUNCTION public.ensure_single_active_terms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active THEN
    UPDATE public.terms_versions SET is_active = false
      WHERE id <> NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER terms_versions_single_active
AFTER INSERT OR UPDATE OF is_active ON public.terms_versions
FOR EACH ROW WHEN (NEW.is_active = true)
EXECUTE FUNCTION public.ensure_single_active_terms();

-- 3. Invoices (immutable snapshots of issued invoices)
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  invoice_number text NOT NULL,
  terms_version_id uuid,
  pdf_path text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by uuid,
  issued_by_email text,
  subtotal_snapshot numeric(14,2) NOT NULL DEFAULT 0,
  discount_snapshot numeric(14,2) NOT NULL DEFAULT 0,
  tax_snapshot numeric(14,2) NOT NULL DEFAULT 0,
  total_snapshot numeric(14,2) NOT NULL DEFAULT 0,
  advance_snapshot numeric(14,2) NOT NULL DEFAULT 0,
  balance_snapshot numeric(14,2) NOT NULL DEFAULT 0,
  brand_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  customer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  items_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  terms_snapshot_html text,
  sent_at timestamptz,
  sent_to text,
  send_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_order ON public.invoices(order_id);
CREATE INDEX idx_invoices_brand ON public.invoices(brand_id);

GRANT SELECT, INSERT, UPDATE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View invoices by brand access"
  ON public.invoices FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));

CREATE POLICY "Insert invoices (admin or ventas)"
  ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (public.can_write_brand(auth.uid(), brand_id));

CREATE POLICY "Update invoices (admin or ventas)"
  ON public.invoices FOR UPDATE TO authenticated
  USING (public.can_write_brand(auth.uid(), brand_id));

-- 4. Storage bucket for invoices (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated view invoice files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'invoices');

CREATE POLICY "Authenticated upload invoice files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoices');

CREATE POLICY "Authenticated update invoice files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'invoices');
