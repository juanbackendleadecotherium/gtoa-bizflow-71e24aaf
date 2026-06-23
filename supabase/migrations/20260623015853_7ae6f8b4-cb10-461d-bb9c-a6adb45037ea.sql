
-- 1) Rename Borrador → Pendiente de planimetría (per brand) + recolor; deactivate Confirmado
UPDATE public.order_statuses
   SET name = 'Pendiente de planimetría',
       slug = 'pendiente-planimetria',
       color = '#a855f7',
       is_initial = true,
       is_active = true
 WHERE slug = 'borrador';

UPDATE public.order_statuses
   SET is_active = false,
       is_initial = false
 WHERE slug = 'confirmado';

-- 2) Per-item planimetry files
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS planimetry_files jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS order_items_planimetry_files_gin
  ON public.order_items USING gin (planimetry_files);

-- Helper used by UI/queries
CREATE OR REPLACE FUNCTION public.order_item_has_planimetry(_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_array_length(planimetry_files), 0) > 0
    FROM public.order_items
   WHERE id = _item_id
$$;

-- 3) Guardrail: cannot attach an order_item to a production order without planimetry
CREATE OR REPLACE FUNCTION public.require_planimetry_for_production()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.production_order_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.production_order_id IS DISTINCT FROM NEW.production_order_id)
     AND COALESCE(jsonb_array_length(NEW.planimetry_files), 0) = 0 THEN
    RAISE EXCEPTION 'No se puede enviar a producción: el producto no tiene planimetría cargada.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_require_planimetry_for_production ON public.order_items;
CREATE TRIGGER trg_require_planimetry_for_production
BEFORE INSERT OR UPDATE OF production_order_id ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.require_planimetry_for_production();

-- 4) Auto seller task on insert when item has no planimetry; auto-resolve on upload
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
BEGIN
  v_has := COALESCE(jsonb_array_length(NEW.planimetry_files), 0) > 0;

  -- Resolve any pending task when planimetry was just uploaded
  IF v_has THEN
    UPDATE public.seller_tasks
       SET status = 'resuelta', resolved_at = now(), updated_at = now()
     WHERE order_item_id = NEW.id
       AND type = 'upload_planimetry'
       AND status = 'pendiente';
    RETURN NEW;
  END IF;

  -- Item has no planimetry: ensure a pending task exists for the seller
  SELECT seller_id, brand_id, invoice_number, order_number
    INTO v_seller, v_brand, v_invoice, v_order_number
    FROM public.orders
   WHERE id = NEW.order_id;
  IF v_seller IS NULL THEN RETURN NEW; END IF;

  -- Skip if a pending task already exists
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

DROP TRIGGER IF EXISTS trg_sync_planimetry_seller_task ON public.order_items;
CREATE TRIGGER trg_sync_planimetry_seller_task
AFTER INSERT OR UPDATE OF planimetry_files ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.sync_planimetry_seller_task();
