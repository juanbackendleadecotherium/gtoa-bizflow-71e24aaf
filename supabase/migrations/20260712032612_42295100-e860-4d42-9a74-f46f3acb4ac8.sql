
INSERT INTO public.order_statuses (brand_id, name, slug, color, sort_order, is_active)
SELECT b.id, 'Pendiente aprobación gerencia', 'pendiente-aprobacion-gerencia', '#f59e0b', -5, true
FROM public.brands b
WHERE b.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.order_statuses s
    WHERE s.brand_id = b.id AND s.name = 'Pendiente aprobación gerencia'
  );

CREATE OR REPLACE FUNCTION public.tg_orders_sync_status_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending_id uuid;
  v_next_id uuid;
  v_current_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.approval_status = 'pendiente' THEN
      SELECT id INTO v_pending_id FROM public.order_statuses
        WHERE brand_id = NEW.brand_id AND name = 'Pendiente aprobación gerencia' AND is_active = true
        LIMIT 1;
      IF v_pending_id IS NOT NULL THEN
        NEW.status_id := v_pending_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    IF NEW.approval_status = 'pendiente' THEN
      SELECT id INTO v_pending_id FROM public.order_statuses
        WHERE brand_id = NEW.brand_id AND name = 'Pendiente aprobación gerencia' AND is_active = true
        LIMIT 1;
      IF v_pending_id IS NOT NULL THEN
        NEW.status_id := v_pending_id;
      END IF;
    ELSIF NEW.approval_status = 'aprobada' THEN
      SELECT name INTO v_current_name FROM public.order_statuses WHERE id = NEW.status_id;
      IF v_current_name IN ('Borrador', 'Pendiente aprobación gerencia') THEN
        SELECT id INTO v_next_id FROM public.order_statuses
          WHERE brand_id = NEW.brand_id AND name = 'Pendiente de planimetría' AND is_active = true
          LIMIT 1;
        IF v_next_id IS NULL THEN
          SELECT id INTO v_next_id FROM public.order_statuses
            WHERE brand_id = NEW.brand_id AND name = 'Pendiente Aprob. Produc.' AND is_active = true
            LIMIT 1;
        END IF;
        IF v_next_id IS NOT NULL THEN
          NEW.status_id := v_next_id;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_sync_status_on_approval ON public.orders;
CREATE TRIGGER orders_sync_status_on_approval
  BEFORE INSERT OR UPDATE OF approval_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_orders_sync_status_on_approval();

DO $$
DECLARE
  v_brand uuid;
  v_order_id uuid;
BEGIN
  SELECT id INTO v_brand FROM public.brands WHERE slug = 'casa-diseno' LIMIT 1;
  IF v_brand IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE brand_id = v_brand AND invoice_number = 'CD-0001') THEN
    RETURN;
  END IF;
  SELECT id INTO v_order_id FROM public.orders WHERE brand_id = v_brand AND invoice_number = 'CD-0002';
  IF v_order_id IS NULL THEN RETURN; END IF;

  UPDATE public.orders           SET invoice_number = 'TMP-CD-0002' WHERE id = v_order_id;
  UPDATE public.invoices         SET invoice_number = 'TMP-CD-0002' WHERE order_id = v_order_id;
  UPDATE public.invoice_versions SET invoice_number = 'TMP-CD-0002' WHERE order_id = v_order_id;

  UPDATE public.orders           SET invoice_number = 'CD-0001' WHERE id = v_order_id;
  UPDATE public.invoices         SET invoice_number = 'CD-0001' WHERE order_id = v_order_id;
  UPDATE public.invoice_versions SET invoice_number = 'CD-0001' WHERE order_id = v_order_id;

  INSERT INTO public.order_audit_log (order_id, action, entity, field, old_value, new_value)
  VALUES (v_order_id, 'invoice_number_renumbered', 'orders', 'invoice_number', to_jsonb('CD-0002'::text), to_jsonb('CD-0001'::text));
END $$;

DELETE FROM public.released_invoice_numbers
  WHERE brand_id IN (
    SELECT id FROM public.brands WHERE slug IN ('casa-diseno','espacio-inmobiliario','getova')
  );
