-- Reemplaza el trigger para considerar is_standard_product
CREATE OR REPLACE FUNCTION public.sync_planimetry_seller_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller uuid;
  v_brand uuid;
  v_title text;
  v_reason text;
  v_invoice text;
  v_order_number text;
  v_has boolean;
  v_standard boolean;
BEGIN
  v_has := COALESCE(jsonb_array_length(NEW.planimetry_files), 0) > 0;
  v_standard := COALESCE(NEW.is_standard_product, false);

  -- Si tiene planimetría, o es producto estándar (no la necesita):
  -- cerrar cualquier tarea pendiente asociada.
  IF v_has OR v_standard THEN
    UPDATE public.seller_tasks
       SET status = 'resuelta', resolved_at = now(), updated_at = now()
     WHERE order_item_id = NEW.id
       AND type = 'upload_planimetry'
       AND status = 'pendiente';
    RETURN NEW;
  END IF;

  -- Ítem sin planimetría y NO estándar: asegurar tarea pendiente para el vendedor
  SELECT seller_id, brand_id, invoice_number, order_number
    INTO v_seller, v_brand, v_invoice, v_order_number
    FROM public.orders
   WHERE id = NEW.order_id;
  IF v_seller IS NULL THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM public.seller_tasks
     WHERE order_item_id = NEW.id
       AND type = 'upload_planimetry'
       AND status = 'pendiente'
  ) THEN
    RETURN NEW;
  END IF;

  v_title := 'Falta planimetría para un producto';
  v_reason := 'Sube la planimetría del producto: ' ||
              COALESCE(split_part(NEW.description, E'\n', 1), 'Producto') ||
              CASE
                WHEN v_invoice IS NOT NULL THEN ' · Fact. ' || v_invoice
                WHEN v_order_number IS NOT NULL THEN ' · ' || v_order_number
                ELSE ''
              END;

  INSERT INTO public.seller_tasks(
    seller_id, order_id, order_item_id, brand_id,
    type, title, reason, severity, status
  ) VALUES (
    v_seller, NEW.order_id, NEW.id, v_brand,
    'upload_planimetry', v_title, v_reason, 'warning', 'pendiente'
  );

  RETURN NEW;
END
$$;

-- Asegurar que el trigger se dispare también cuando cambia is_standard_product
DROP TRIGGER IF EXISTS trg_sync_planimetry_seller_task ON public.order_items;
CREATE TRIGGER trg_sync_planimetry_seller_task
AFTER INSERT OR UPDATE OF planimetry_files, is_standard_product ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.sync_planimetry_seller_task();

-- Limpieza única: resolver tareas pendientes de ítems ya marcados como estándar
UPDATE public.seller_tasks st
   SET status = 'resuelta', resolved_at = now(), updated_at = now()
  FROM public.order_items oi
 WHERE st.order_item_id = oi.id
   AND st.type = 'upload_planimetry'
   AND st.status = 'pendiente'
   AND COALESCE(oi.is_standard_product, false) = true;