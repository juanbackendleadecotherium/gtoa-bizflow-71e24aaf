-- 1) Crear estado "En producción parcial" por cada marca si no existe.
INSERT INTO public.order_statuses (brand_id, name, slug, color, is_initial, is_final, is_active, sort_order)
SELECT b.id, 'En producción parcial', 'en-produccion-parcial', '#f97316', false, false, true,
       COALESCE((SELECT sort_order FROM public.order_statuses s2
                  WHERE s2.brand_id = b.id AND s2.slug = 'en-produccion'), 50) - 1
  FROM public.brands b
 WHERE NOT EXISTS (
   SELECT 1 FROM public.order_statuses s
    WHERE s.brand_id = b.id AND s.slug = 'en-produccion-parcial'
 );

-- 2) Reescribir el trigger para diferenciar parcial vs completo
CREATE OR REPLACE FUNCTION public.sync_order_status_on_production()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order_id uuid;
  v_brand_id uuid;
  v_current_status uuid;
  v_current_slug text;
  v_total int;
  v_sent int;
  v_target_slug text;
  v_target uuid;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  IF v_order_id IS NULL THEN RETURN NEW; END IF;

  SELECT o.brand_id, o.status_id, s.slug
    INTO v_brand_id, v_current_status, v_current_slug
    FROM public.orders o
    LEFT JOIN public.order_statuses s ON s.id = o.status_id
   WHERE o.id = v_order_id;

  -- Sólo actuamos si la venta está en un estado del flujo temprano de producción
  IF v_current_slug NOT IN ('pendiente-planimetria','confirmado','en-produccion-parcial','en-produccion') THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE production_order_id IS NOT NULL)
    INTO v_total, v_sent
    FROM public.order_items
   WHERE order_id = v_order_id;

  IF v_total = 0 THEN RETURN NEW; END IF;

  IF v_sent = 0 THEN
    -- Ninguno enviado aún: no tocamos el estado inicial.
    RETURN NEW;
  ELSIF v_sent < v_total THEN
    v_target_slug := 'en-produccion-parcial';
  ELSE
    v_target_slug := 'en-produccion';
  END IF;

  SELECT id INTO v_target FROM public.order_statuses
   WHERE brand_id = v_brand_id AND slug = v_target_slug LIMIT 1;

  IF v_target IS NOT NULL AND v_target IS DISTINCT FROM v_current_status THEN
    PERFORM set_config(
      'app.status_note',
      CASE WHEN v_target_slug = 'en-produccion-parcial'
           THEN 'Producción parcial: ' || v_sent || ' de ' || v_total || ' productos enviados.'
           ELSE 'Todos los productos enviados a producción — cambio automático.' END,
      true);
    UPDATE public.orders SET status_id = v_target WHERE id = v_order_id;
  END IF;

  RETURN NEW;
END $$;

-- Trigger sigue disparando cuando cambia production_order_id (ya no dependemos de is_standard_product)
DROP TRIGGER IF EXISTS trg_sync_order_status_on_production ON public.order_items;
CREATE TRIGGER trg_sync_order_status_on_production
AFTER INSERT OR UPDATE OF production_order_id ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.sync_order_status_on_production();

-- 3) Ajuste retroactivo: ventas hoy en "en-produccion" con items sin enviar deben pasar a parcial.
DO $$
DECLARE r record; v_target uuid;
BEGIN
  FOR r IN
    SELECT o.id, o.brand_id
      FROM public.orders o
      JOIN public.order_statuses os ON os.id = o.status_id
     WHERE os.slug = 'en-produccion'
       AND EXISTS (SELECT 1 FROM public.order_items oi
                    WHERE oi.order_id = o.id AND oi.production_order_id IS NULL)
  LOOP
    SELECT id INTO v_target FROM public.order_statuses
     WHERE brand_id = r.brand_id AND slug = 'en-produccion-parcial' LIMIT 1;
    IF v_target IS NOT NULL THEN
      PERFORM set_config('app.status_note','Ajuste: hay productos aún sin enviar a producción.', true);
      UPDATE public.orders SET status_id = v_target WHERE id = r.id;
    END IF;
  END LOOP;
END $$;