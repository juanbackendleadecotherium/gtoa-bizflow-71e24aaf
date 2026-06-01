-- Finance module: payments, follow-ups, financial view

-- 1) Payments table (additional payments after initial advance)
CREATE TABLE public.order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_at date NOT NULL DEFAULT current_date,
  method text,
  reference text,
  proof_url text,
  note text,
  created_by uuid,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_payments TO authenticated;
GRANT ALL ON public.order_payments TO service_role;

ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View payments by brand access"
  ON public.order_payments FOR SELECT TO authenticated
  USING (has_brand_access(auth.uid(), brand_id));

CREATE POLICY "Insert payments (admin or ventas)"
  ON public.order_payments FOR INSERT TO authenticated
  WITH CHECK (can_write_brand(auth.uid(), brand_id));

CREATE POLICY "Update payments (admin only)"
  ON public.order_payments FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Delete payments (admin only)"
  ON public.order_payments FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_order_payments_order_id ON public.order_payments(order_id);
CREATE INDEX idx_order_payments_brand_id ON public.order_payments(brand_id);
CREATE INDEX idx_order_payments_paid_at ON public.order_payments(paid_at);

-- Audit trigger
CREATE OR REPLACE FUNCTION public.log_order_payment_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  uemail text;
BEGIN
  SELECT email INTO uemail FROM public.profiles WHERE user_id = uid LIMIT 1;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, new_value)
    VALUES (NEW.order_id, uid, uemail, 'payment_insert', 'order_payment', NEW.id,
      jsonb_build_object('amount', NEW.amount, 'method', NEW.method, 'paid_at', NEW.paid_at, 'reference', NEW.reference));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, old_value)
    VALUES (OLD.order_id, uid, uemail, 'payment_delete', 'order_payment', OLD.id,
      jsonb_build_object('amount', OLD.amount, 'method', OLD.method, 'paid_at', OLD.paid_at));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_log_order_payment_changes
AFTER INSERT OR DELETE ON public.order_payments
FOR EACH ROW EXECUTE FUNCTION public.log_order_payment_changes();

-- Set created_by/email automatically
CREATE OR REPLACE FUNCTION public.set_order_payment_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  IF NEW.created_by_email IS NULL THEN
    SELECT email INTO NEW.created_by_email FROM public.profiles WHERE user_id = NEW.created_by LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_order_payment_creator
BEFORE INSERT ON public.order_payments
FOR EACH ROW EXECUTE FUNCTION public.set_order_payment_creator();

-- 2) Follow-ups table
CREATE TABLE public.order_collection_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE,
  brand_id uuid NOT NULL,
  next_contact_date date,
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','contactado','promesa','cerrado')),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_collection_followups TO authenticated;
GRANT ALL ON public.order_collection_followups TO service_role;

ALTER TABLE public.order_collection_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View followups by brand access"
  ON public.order_collection_followups FOR SELECT TO authenticated
  USING (has_brand_access(auth.uid(), brand_id));

CREATE POLICY "Insert followups (admin or ventas)"
  ON public.order_collection_followups FOR INSERT TO authenticated
  WITH CHECK (can_write_brand(auth.uid(), brand_id));

CREATE POLICY "Update followups (admin or ventas)"
  ON public.order_collection_followups FOR UPDATE TO authenticated
  USING (can_write_brand(auth.uid(), brand_id));

CREATE POLICY "Delete followups (admin only)"
  ON public.order_collection_followups FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_followups_updated_at
BEFORE UPDATE ON public.order_collection_followups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Financial view
CREATE OR REPLACE VIEW public.order_financials
WITH (security_invoker = true)
AS
SELECT
  o.id AS order_id,
  o.brand_id,
  o.order_number,
  o.invoice_number,
  o.customer_name,
  o.customer_phone,
  o.customer_email,
  o.created_at,
  o.sale_date,
  o.total,
  o.advance_amount,
  COALESCE(p.payments_total, 0) AS payments_total,
  (COALESCE(o.advance_amount, 0) + COALESCE(p.payments_total, 0)) AS paid_total,
  GREATEST(o.total - COALESCE(o.advance_amount, 0) - COALESCE(p.payments_total, 0), 0) AS balance,
  CASE
    WHEN o.total <= COALESCE(o.advance_amount, 0) + COALESCE(p.payments_total, 0) THEN 'pagada'
    WHEN COALESCE(o.advance_amount, 0) + COALESCE(p.payments_total, 0) > 0 THEN 'abono'
    ELSE 'sin_abono'
  END AS payment_status,
  EXTRACT(DAY FROM (now() - o.created_at))::int AS days_since_sale,
  o.created_by,
  o.seller_id,
  COALESCE(pr.display_name, pr.email, 'Sin asignar') AS seller_label
FROM public.orders o
LEFT JOIN (
  SELECT order_id, SUM(amount) AS payments_total
  FROM public.order_payments
  GROUP BY order_id
) p ON p.order_id = o.id
LEFT JOIN public.profiles pr ON pr.user_id = o.created_by;

GRANT SELECT ON public.order_financials TO authenticated;
GRANT ALL ON public.order_financials TO service_role;