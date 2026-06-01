ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE,
  ADD CONSTRAINT invoices_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT,
  ADD CONSTRAINT invoices_terms_version_id_fkey FOREIGN KEY (terms_version_id) REFERENCES public.terms_versions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS invoices_order_id_idx ON public.invoices(order_id);