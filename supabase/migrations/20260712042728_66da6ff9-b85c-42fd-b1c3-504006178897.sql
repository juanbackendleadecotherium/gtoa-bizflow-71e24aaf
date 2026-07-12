CREATE OR REPLACE FUNCTION public.log_planimetry_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  uemail text;
  v_exists boolean;
BEGIN
  SELECT email INTO uemail FROM public.profiles WHERE user_id = uid LIMIT 1;
  IF TG_OP = 'INSERT' THEN
    IF NEW.uploaded_by IS NULL THEN NEW.uploaded_by := uid; END IF;
    IF NEW.uploaded_by_email IS NULL THEN NEW.uploaded_by_email := uemail; END IF;
    INSERT INTO public.production_audit_log(production_order_id, brand_id, action, new_value, changed_by, changed_by_email)
    VALUES (NEW.production_order_id, NEW.brand_id, 'planimetry_upload',
      jsonb_build_object('file_name', NEW.file_name, 'version', NEW.version), uid, uemail);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Skip audit if the parent production order was already deleted (cascade delete
    -- from orders). Inserting would violate the FK to production_orders.
    SELECT EXISTS(SELECT 1 FROM public.production_orders WHERE id = OLD.production_order_id)
      INTO v_exists;
    IF v_exists THEN
      INSERT INTO public.production_audit_log(production_order_id, brand_id, action, old_value, changed_by, changed_by_email)
      VALUES (OLD.production_order_id, OLD.brand_id, 'planimetry_delete',
        jsonb_build_object('file_name', OLD.file_name, 'version', OLD.version), uid, uemail);
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;