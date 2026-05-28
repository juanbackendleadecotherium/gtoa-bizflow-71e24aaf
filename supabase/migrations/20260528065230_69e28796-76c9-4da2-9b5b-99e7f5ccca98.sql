-- 1) Add customer snapshot columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_doc_type text,
  ADD COLUMN IF NOT EXISTS customer_doc_number text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS customer_address text,
  ADD COLUMN IF NOT EXISTS customer_city text,
  ADD COLUMN IF NOT EXISTS customer_department text,
  ADD COLUMN IF NOT EXISTS customer_company text,
  ADD COLUMN IF NOT EXISTS customer_person_type text,
  ADD COLUMN IF NOT EXISTS customer_contact_type text;

-- 2) Backfill from customers
UPDATE public.orders o
SET
  customer_name        = COALESCE(o.customer_name, c.display_name),
  customer_doc_type    = COALESCE(o.customer_doc_type, c.doc_type),
  customer_doc_number  = COALESCE(o.customer_doc_number, c.doc_number),
  customer_phone       = COALESCE(o.customer_phone, c.phone),
  customer_email       = COALESCE(o.customer_email, c.email),
  customer_address     = COALESCE(o.customer_address, c.address),
  customer_city        = COALESCE(o.customer_city, c.city),
  customer_department  = COALESCE(o.customer_department, c.department),
  customer_company     = COALESCE(o.customer_company, c.company),
  customer_person_type = COALESCE(o.customer_person_type, c.person_type),
  customer_contact_type= COALESCE(o.customer_contact_type, c.contact_type)
FROM public.customers c
WHERE o.customer_id = c.id;

-- 3) Make customer_id optional
ALTER TABLE public.orders ALTER COLUMN customer_id DROP NOT NULL;

UPDATE public.orders SET customer_name = COALESCE(customer_name, 'Sin nombre') WHERE customer_name IS NULL;
ALTER TABLE public.orders ALTER COLUMN customer_name SET NOT NULL;

-- 4) Simple search indexes
CREATE INDEX IF NOT EXISTS idx_orders_customer_name_lower ON public.orders (lower(customer_name));
CREATE INDEX IF NOT EXISTS idx_orders_customer_doc_number ON public.orders (customer_doc_number);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON public.orders (customer_phone);

-- 5) Audit snapshot fields
CREATE OR REPLACE FUNCTION public.log_order_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  uemail text;
BEGIN
  SELECT email INTO uemail FROM public.profiles WHERE user_id = uid LIMIT 1;

  IF NEW.notes IS DISTINCT FROM OLD.notes THEN
    INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, field, old_value, new_value)
    VALUES (NEW.id, uid, uemail, 'update', 'order', NEW.id, 'notes', to_jsonb(OLD.notes), to_jsonb(NEW.notes));
  END IF;
  IF NEW.discount IS DISTINCT FROM OLD.discount THEN
    INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, field, old_value, new_value)
    VALUES (NEW.id, uid, uemail, 'update', 'order', NEW.id, 'discount', to_jsonb(OLD.discount), to_jsonb(NEW.discount));
  END IF;
  IF NEW.tax IS DISTINCT FROM OLD.tax THEN
    INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, field, old_value, new_value)
    VALUES (NEW.id, uid, uemail, 'update', 'order', NEW.id, 'tax', to_jsonb(OLD.tax), to_jsonb(NEW.tax));
  END IF;
  IF NEW.estimated_delivery_date IS DISTINCT FROM OLD.estimated_delivery_date THEN
    INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, field, old_value, new_value)
    VALUES (NEW.id, uid, uemail, 'update', 'order', NEW.id, 'estimated_delivery_date', to_jsonb(OLD.estimated_delivery_date), to_jsonb(NEW.estimated_delivery_date));
  END IF;
  IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number THEN
    INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, field, old_value, new_value)
    VALUES (NEW.id, uid, uemail, 'update', 'order', NEW.id, 'invoice_number', to_jsonb(OLD.invoice_number), to_jsonb(NEW.invoice_number));
  END IF;
  IF NEW.sale_date IS DISTINCT FROM OLD.sale_date THEN
    INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, field, old_value, new_value)
    VALUES (NEW.id, uid, uemail, 'update', 'order', NEW.id, 'sale_date', to_jsonb(OLD.sale_date), to_jsonb(NEW.sale_date));
  END IF;
  IF NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN
    INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, field, old_value, new_value)
    VALUES (NEW.id, uid, uemail, 'update', 'order', NEW.id, 'payment_method', to_jsonb(OLD.payment_method), to_jsonb(NEW.payment_method));
  END IF;
  IF NEW.advance_amount IS DISTINCT FROM OLD.advance_amount THEN
    INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, field, old_value, new_value)
    VALUES (NEW.id, uid, uemail, 'update', 'order', NEW.id, 'advance_amount', to_jsonb(OLD.advance_amount), to_jsonb(NEW.advance_amount));
  END IF;
  IF NEW.customer_name IS DISTINCT FROM OLD.customer_name THEN
    INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, field, old_value, new_value)
    VALUES (NEW.id, uid, uemail, 'update', 'order', NEW.id, 'customer_name', to_jsonb(OLD.customer_name), to_jsonb(NEW.customer_name));
  END IF;
  IF NEW.customer_doc_number IS DISTINCT FROM OLD.customer_doc_number THEN
    INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, field, old_value, new_value)
    VALUES (NEW.id, uid, uemail, 'update', 'order', NEW.id, 'customer_doc_number', to_jsonb(OLD.customer_doc_number), to_jsonb(NEW.customer_doc_number));
  END IF;
  IF NEW.customer_phone IS DISTINCT FROM OLD.customer_phone THEN
    INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, field, old_value, new_value)
    VALUES (NEW.id, uid, uemail, 'update', 'order', NEW.id, 'customer_phone', to_jsonb(OLD.customer_phone), to_jsonb(NEW.customer_phone));
  END IF;
  IF NEW.customer_email IS DISTINCT FROM OLD.customer_email THEN
    INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, field, old_value, new_value)
    VALUES (NEW.id, uid, uemail, 'update', 'order', NEW.id, 'customer_email', to_jsonb(OLD.customer_email), to_jsonb(NEW.customer_email));
  END IF;
  IF NEW.customer_address IS DISTINCT FROM OLD.customer_address THEN
    INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, field, old_value, new_value)
    VALUES (NEW.id, uid, uemail, 'update', 'order', NEW.id, 'customer_address', to_jsonb(OLD.customer_address), to_jsonb(NEW.customer_address));
  END IF;
  IF NEW.customer_city IS DISTINCT FROM OLD.customer_city THEN
    INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, field, old_value, new_value)
    VALUES (NEW.id, uid, uemail, 'update', 'order', NEW.id, 'customer_city', to_jsonb(OLD.customer_city), to_jsonb(NEW.customer_city));
  END IF;
  RETURN NEW;
END;
$function$;
