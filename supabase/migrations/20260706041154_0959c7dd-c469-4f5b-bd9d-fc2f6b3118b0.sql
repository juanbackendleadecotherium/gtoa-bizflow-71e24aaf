
CREATE OR REPLACE FUNCTION public.require_planimetry_for_production()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.production_order_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.production_order_id IS DISTINCT FROM NEW.production_order_id)
     AND COALESCE(NEW.is_standard_product, false) = false
     AND COALESCE(jsonb_array_length(NEW.planimetry_files), 0) = 0
     AND NOT EXISTS (
       SELECT 1 FROM public.production_planimetries pp
       WHERE pp.production_order_id = NEW.production_order_id
         AND pp.order_item_id = NEW.id
     )
  THEN
    RAISE EXCEPTION 'No se puede enviar a producción: el producto no tiene planimetría cargada.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$function$;
