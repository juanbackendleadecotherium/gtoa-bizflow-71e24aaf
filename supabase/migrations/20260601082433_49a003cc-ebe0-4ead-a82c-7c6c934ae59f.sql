-- Add deposit account tracking to payments + orders advance
ALTER TABLE public.order_payments ADD COLUMN IF NOT EXISTS deposit_account text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS advance_deposit_account text;

CREATE INDEX IF NOT EXISTS idx_order_payments_deposit_account ON public.order_payments(deposit_account);
CREATE INDEX IF NOT EXISTS idx_orders_advance_deposit_account ON public.orders(advance_deposit_account);

-- Audit: include deposit_account in payment audit jsonb
CREATE OR REPLACE FUNCTION public.log_order_payment_changes()
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
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, new_value)
    VALUES (NEW.order_id, uid, uemail, 'payment_insert', 'order_payment', NEW.id,
      jsonb_build_object('amount', NEW.amount, 'method', NEW.method, 'paid_at', NEW.paid_at, 'reference', NEW.reference, 'deposit_account', NEW.deposit_account));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, old_value)
    VALUES (OLD.order_id, uid, uemail, 'payment_delete', 'order_payment', OLD.id,
      jsonb_build_object('amount', OLD.amount, 'method', OLD.method, 'paid_at', OLD.paid_at, 'deposit_account', OLD.deposit_account));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

-- Audit: log advance_deposit_account changes on orders
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
  IF NEW.advance_deposit_account IS DISTINCT FROM OLD.advance_deposit_account THEN
    INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, field, old_value, new_value)
    VALUES (NEW.id, uid, uemail, 'update', 'order', NEW.id, 'advance_deposit_account', to_jsonb(OLD.advance_deposit_account), to_jsonb(NEW.advance_deposit_account));
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