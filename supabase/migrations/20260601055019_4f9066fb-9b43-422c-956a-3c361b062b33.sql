
-- Versioned history of invoice PDFs per sale (one row per regeneration)
CREATE TABLE public.invoice_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
  version_number int NOT NULL,
  invoice_number text NOT NULL,
  pdf_path text NOT NULL,
  issued_by uuid,
  issued_by_email text,
  subtotal_snapshot numeric(14,2) NOT NULL DEFAULT 0,
  discount_snapshot numeric(14,2) NOT NULL DEFAULT 0,
  tax_snapshot numeric(14,2) NOT NULL DEFAULT 0,
  total_snapshot numeric(14,2) NOT NULL DEFAULT 0,
  advance_snapshot numeric(14,2) NOT NULL DEFAULT 0,
  balance_snapshot numeric(14,2) NOT NULL DEFAULT 0,
  brand_snapshot jsonb,
  customer_snapshot jsonb,
  items_snapshot jsonb,
  change_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, version_number)
);

GRANT SELECT, INSERT ON public.invoice_versions TO authenticated;
GRANT ALL ON public.invoice_versions TO service_role;

ALTER TABLE public.invoice_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invoice versions for their brands"
ON public.invoice_versions FOR SELECT TO authenticated
USING (public.has_brand_access(auth.uid(), brand_id));

CREATE POLICY "Users can insert invoice versions for writable brands"
ON public.invoice_versions FOR INSERT TO authenticated
WITH CHECK (public.can_write_brand(auth.uid(), brand_id));

CREATE INDEX idx_invoice_versions_invoice ON public.invoice_versions(invoice_id, version_number DESC);
CREATE INDEX idx_invoice_versions_order ON public.invoice_versions(order_id);

-- Backfill: create v1 from existing invoices
INSERT INTO public.invoice_versions
  (invoice_id, order_id, brand_id, version_number, invoice_number, pdf_path,
   issued_by, issued_by_email, subtotal_snapshot, discount_snapshot, tax_snapshot,
   total_snapshot, advance_snapshot, balance_snapshot, brand_snapshot,
   customer_snapshot, items_snapshot, change_summary, created_at)
SELECT id, order_id, brand_id, 1, invoice_number, pdf_path,
   issued_by, issued_by_email, subtotal_snapshot, discount_snapshot, tax_snapshot,
   total_snapshot, advance_snapshot, balance_snapshot, brand_snapshot,
   customer_snapshot, items_snapshot, 'Versión inicial', issued_at
FROM public.invoices
WHERE pdf_path IS NOT NULL
ON CONFLICT DO NOTHING;
