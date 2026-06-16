
-- 1) order_items: campos por producto
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS supplier_promised_date date,
  ADD COLUMN IF NOT EXISTS supplier_actual_date date,
  ADD COLUMN IF NOT EXISTS production_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS production_due_date date;

-- 2) production_planimetries: planimetría por ítem
ALTER TABLE public.production_planimetries
  ADD COLUMN IF NOT EXISTS order_item_id uuid REFERENCES public.order_items(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS production_planimetries_item_idx
  ON public.production_planimetries(production_order_id, order_item_id, version);

-- 3) seller_tasks: alertas informativas
ALTER TABLE public.seller_tasks
  ADD COLUMN IF NOT EXISTS order_item_id uuid REFERENCES public.order_items(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'action';

-- 4) Auto-quotation_date al asignar proveedor a la OP
CREATE OR REPLACE FUNCTION public.production_orders_auto_quotation_date()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.supplier_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.supplier_id IS DISTINCT FROM NEW.supplier_id)
     AND NEW.quotation_date IS NULL THEN
    NEW.quotation_date := current_date;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_po_auto_quotation_date ON public.production_orders;
CREATE TRIGGER trg_po_auto_quotation_date
  BEFORE INSERT OR UPDATE OF supplier_id ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.production_orders_auto_quotation_date();

-- 5) Auto-quotation_date cuando se asigna proveedor a un ítem
CREATE OR REPLACE FUNCTION public.order_items_auto_quotation_date()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.supplier_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.supplier_id IS DISTINCT FROM NEW.supplier_id)
     AND NEW.production_order_id IS NOT NULL THEN
    UPDATE public.production_orders
       SET quotation_date = current_date
     WHERE id = NEW.production_order_id
       AND quotation_date IS NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_oi_auto_quotation_date ON public.order_items;
CREATE TRIGGER trg_oi_auto_quotation_date
  AFTER INSERT OR UPDATE OF supplier_id ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_items_auto_quotation_date();

-- 6) RPC: marcar inicio real de producción de un ítem + alertar vendedor
CREATE OR REPLACE FUNCTION public.start_real_production(p_item_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item public.order_items%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_po public.production_orders%ROWTYPE;
  v_remaining int;
  v_title text;
  v_reason text;
BEGIN
  SELECT * INTO v_item FROM public.order_items WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
  IF v_item.production_started_at IS NOT NULL THEN
    RETURN; -- idempotente
  END IF;

  UPDATE public.order_items SET production_started_at = now() WHERE id = p_item_id;

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id;
  IF v_item.production_order_id IS NOT NULL THEN
    SELECT * INTO v_po FROM public.production_orders WHERE id = v_item.production_order_id;
  END IF;

  IF v_order.seller_id IS NOT NULL THEN
    v_title := 'Tu producto empezó a producirse hoy';
    v_reason := 'El proveedor inició la producción real de: ' ||
                COALESCE(split_part(v_item.description, E'\n', 1), 'Producto') ||
                CASE WHEN v_order.invoice_number IS NOT NULL
                     THEN ' · Fact. ' || v_order.invoice_number
                     ELSE ' · ' || COALESCE(v_order.order_number, '') END;
    INSERT INTO public.seller_tasks(
      seller_id, order_id, production_order_id, order_item_id, brand_id,
      type, title, reason, severity, status
    ) VALUES (
      v_order.seller_id, v_order.id, v_item.production_order_id, v_item.id, v_order.brand_id,
      'production_started', v_title, v_reason, 'info', 'pendiente'
    );
  END IF;

  -- Si todos los ítems de la OP arrancaron, sellar production_start_date
  IF v_item.production_order_id IS NOT NULL THEN
    SELECT count(*) INTO v_remaining
      FROM public.order_items
     WHERE production_order_id = v_item.production_order_id
       AND production_started_at IS NULL;
    IF v_remaining = 0 AND v_po.production_start_date IS NULL THEN
      UPDATE public.production_orders
         SET production_start_date = current_date
       WHERE id = v_item.production_order_id;
    END IF;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.start_real_production(uuid) TO authenticated;

-- 7) Semilla de proveedores principales en todas las marcas activas
INSERT INTO public.suppliers (brand_id, name, category, is_active)
SELECT b.id, s.name, 'taller', true
  FROM public.brands b
  CROSS JOIN (VALUES
    ('Montenegro Atelier Tapicería'),
    ('Ebanistería')
  ) AS s(name)
 WHERE b.is_active = true
   AND NOT EXISTS (
     SELECT 1 FROM public.suppliers x
      WHERE x.brand_id = b.id AND lower(x.name) = lower(s.name)
   );
