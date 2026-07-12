
CREATE TABLE public.order_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  customer_name text,
  items_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_drafts_seller_idx ON public.order_drafts(seller_id, updated_at DESC);
CREATE INDEX order_drafts_brand_idx ON public.order_drafts(brand_id, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_drafts TO authenticated;
GRANT ALL ON public.order_drafts TO service_role;

ALTER TABLE public.order_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seller manages own drafts"
  ON public.order_drafts FOR ALL TO authenticated
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

CREATE POLICY "admin/finance read drafts"
  ON public.order_drafts FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'finanzas'::app_role)
  );

CREATE POLICY "admin deletes any draft"
  ON public.order_drafts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.tg_order_drafts_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_order_drafts_touch
  BEFORE UPDATE ON public.order_drafts
  FOR EACH ROW EXECUTE FUNCTION public.tg_order_drafts_touch();
