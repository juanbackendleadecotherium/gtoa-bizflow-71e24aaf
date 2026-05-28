
-- Customers: add company, person type, contact type, department
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS person_type text CHECK (person_type IN ('natural','juridica')),
  ADD COLUMN IF NOT EXISTS contact_type text NOT NULL DEFAULT 'cliente' CHECK (contact_type IN ('cliente','proveedor')),
  ADD COLUMN IF NOT EXISTS department text;

-- Orders: invoice number, sale date, payment modality, advance amount
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS sale_date date,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS advance_amount numeric(14,2) NOT NULL DEFAULT 0;

-- Audit: log new order fields
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
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
    INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, field, old_value, new_value)
    VALUES (NEW.id, uid, uemail, 'update', 'order', NEW.id, 'customer_id', to_jsonb(OLD.customer_id), to_jsonb(NEW.customer_id));
  END IF;
  IF NEW.estimated_delivery_date IS DISTINCT FROM OLD.estimated_delivery_date THEN
    INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, field, old_value, new_value)
    VALUES (NEW.id, uid, uemail, 'update', 'order', NEW.id, 'estimated_delivery_date', to_jsonb(OLD.estimated_delivery_date), to_jsonb(NEW.estimated_delivery_date));
  END IF;
  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id THEN
    INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, field, old_value, new_value)
    VALUES (NEW.id, uid, uemail, 'update', 'order', NEW.id, 'seller_id', to_jsonb(OLD.seller_id), to_jsonb(NEW.seller_id));
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
  RETURN NEW;
END;
$function$;
