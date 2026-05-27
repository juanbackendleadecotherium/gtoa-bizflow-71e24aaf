
-- Audit log table for order changes
CREATE TABLE public.order_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  changed_by uuid,
  changed_by_email text,
  action text NOT NULL, -- 'update' | 'item_insert' | 'item_update' | 'item_delete'
  entity text NOT NULL, -- 'order' | 'order_item'
  entity_id uuid,
  field text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_audit_order ON public.order_audit_log(order_id, created_at DESC);

GRANT SELECT ON public.order_audit_log TO authenticated;
GRANT ALL ON public.order_audit_log TO service_role;

ALTER TABLE public.order_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View audit by brand access"
ON public.order_audit_log FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_audit_log.order_id AND public.has_brand_access(auth.uid(), o.brand_id)));

-- Trigger function to log order field changes
CREATE OR REPLACE FUNCTION public.log_order_changes()
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
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_order_changes
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_changes();

-- Trigger function for order_items
CREATE OR REPLACE FUNCTION public.log_order_item_changes()
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
    VALUES (NEW.order_id, uid, uemail, 'item_insert', 'order_item', NEW.id,
      jsonb_build_object('description', NEW.description, 'quantity', NEW.quantity, 'unit_price', NEW.unit_price));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.description IS DISTINCT FROM OLD.description
       OR NEW.quantity IS DISTINCT FROM OLD.quantity
       OR NEW.unit_price IS DISTINCT FROM OLD.unit_price THEN
      INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, old_value, new_value)
      VALUES (NEW.order_id, uid, uemail, 'item_update', 'order_item', NEW.id,
        jsonb_build_object('description', OLD.description, 'quantity', OLD.quantity, 'unit_price', OLD.unit_price),
        jsonb_build_object('description', NEW.description, 'quantity', NEW.quantity, 'unit_price', NEW.unit_price));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.order_audit_log(order_id, changed_by, changed_by_email, action, entity, entity_id, old_value)
    VALUES (OLD.order_id, uid, uemail, 'item_delete', 'order_item', OLD.id,
      jsonb_build_object('description', OLD.description, 'quantity', OLD.quantity, 'unit_price', OLD.unit_price));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_log_order_item_changes
AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.log_order_item_changes();
