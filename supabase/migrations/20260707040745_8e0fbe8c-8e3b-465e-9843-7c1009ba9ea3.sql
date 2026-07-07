
-- 1) Asegurar "Pendiente Aprob. Produc." por marca
INSERT INTO public.order_statuses (brand_id, name, slug, color, is_initial, is_final, is_active, sort_order)
SELECT b.id, 'Pendiente Aprob. Produc.', 'pendiente-aprobacion-produccion', '#eae54d', false, false, true,
       COALESCE((SELECT sort_order FROM public.order_statuses s2
                  WHERE s2.brand_id = b.id AND s2.slug = 'en-produccion-parcial'), 3) - 1
  FROM public.brands b
 WHERE NOT EXISTS (
   SELECT 1 FROM public.order_statuses s
    WHERE s.brand_id = b.id AND s.slug = 'pendiente-aprobacion-produccion'
 );

-- 2) Reescribir sync a 4 estados
CREATE OR REPLACE FUNCTION public.sync_order_status_on_production()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order_id uuid;
  v_brand_id uuid;
  v_current_status uuid;
  v_current_slug text;
  v_total int;
  v_sent int;
  v_approved int;
  v_target_slug text;
  v_target uuid;
  v_note text;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  IF v_order_id IS NULL THEN RETURN NEW; END IF;

  SELECT o.brand_id, o.status_id, s.slug
    INTO v_brand_id, v_current_status, v_current_slug
    FROM public.orders o
    LEFT JOIN public.order_statuses s ON s.id = o.status_id
   WHERE o.id = v_order_id;

  -- Solo actuamos en estados de flujo temprano
  IF v_current_slug NOT IN (
      'pendiente-planimetria','confirmado',
      'pendiente-aprobacion-produccion','en-produccion-parcial','en-produccion'
     ) THEN
    RETURN NEW;
  END IF;

  SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE oi.production_order_id IS NOT NULL),
      COUNT(*) FILTER (
        WHERE oi.production_order_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.production_orders po
             WHERE po.id = oi.production_order_id
               AND po.status NOT IN ('pendiente','rechazada','cancelado')
          )
      )
    INTO v_total, v_sent, v_approved
    FROM public.order_items oi
   WHERE oi.order_id = v_order_id;

  IF v_total = 0 THEN RETURN NEW; END IF;

  IF v_sent = 0 THEN
    RETURN NEW; -- sigue en pendiente-planimetria
  ELSIF v_approved = 0 THEN
    v_target_slug := 'pendiente-aprobacion-produccion';
    v_note := 'Enviado(s) ' || v_sent || ' de ' || v_total || ' a producción — esperando aprobación.';
  ELSIF v_approved < v_total THEN
    v_target_slug := 'en-produccion-parcial';
    v_note := 'Producción parcial: ' || v_approved || ' de ' || v_total || ' aprobado(s).';
  ELSE
    v_target_slug := 'en-produccion';
    v_note := 'Todos los productos aprobados por producción.';
  END IF;

  SELECT id INTO v_target FROM public.order_statuses
   WHERE brand_id = v_brand_id AND slug = v_target_slug LIMIT 1;

  IF v_target IS NOT NULL AND v_target IS DISTINCT FROM v_current_status THEN
    PERFORM set_config('app.status_note', v_note, true);
    UPDATE public.orders SET status_id = v_target WHERE id = v_order_id;
  END IF;

  RETURN NEW;
END $$;

-- Disparador sobre order_items ya existe; reasegurar
DROP TRIGGER IF EXISTS trg_sync_order_status_on_production ON public.order_items;
CREATE TRIGGER trg_sync_order_status_on_production
AFTER INSERT OR UPDATE OF production_order_id ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.sync_order_status_on_production();

-- 3) Nuevo disparador: cuando cambia estado de production_orders, recalcular la venta
CREATE OR REPLACE FUNCTION public.sync_order_status_on_po_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order_id uuid;
  v_brand_id uuid;
  v_current_status uuid;
  v_current_slug text;
  v_total int;
  v_sent int;
  v_approved int;
  v_target_slug text;
  v_target uuid;
  v_note text;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  IF v_order_id IS NULL THEN RETURN NEW; END IF;

  SELECT o.brand_id, o.status_id, s.slug
    INTO v_brand_id, v_current_status, v_current_slug
    FROM public.orders o
    LEFT JOIN public.order_statuses s ON s.id = o.status_id
   WHERE o.id = v_order_id;

  IF v_current_slug NOT IN (
      'pendiente-planimetria','confirmado',
      'pendiente-aprobacion-produccion','en-produccion-parcial','en-produccion'
     ) THEN
    RETURN NEW;
  END IF;

  SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE oi.production_order_id IS NOT NULL),
      COUNT(*) FILTER (
        WHERE oi.production_order_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.production_orders po
             WHERE po.id = oi.production_order_id
               AND po.status NOT IN ('pendiente','rechazada','cancelado')
          )
      )
    INTO v_total, v_sent, v_approved
    FROM public.order_items oi
   WHERE oi.order_id = v_order_id;

  IF v_total = 0 THEN RETURN NEW; END IF;

  IF v_sent = 0 THEN
    RETURN NEW;
  ELSIF v_approved = 0 THEN
    v_target_slug := 'pendiente-aprobacion-produccion';
    v_note := 'Enviado(s) ' || v_sent || ' de ' || v_total || ' a producción — esperando aprobación.';
  ELSIF v_approved < v_total THEN
    v_target_slug := 'en-produccion-parcial';
    v_note := 'Producción parcial: ' || v_approved || ' de ' || v_total || ' aprobado(s).';
  ELSE
    v_target_slug := 'en-produccion';
    v_note := 'Todos los productos aprobados por producción.';
  END IF;

  SELECT id INTO v_target FROM public.order_statuses
   WHERE brand_id = v_brand_id AND slug = v_target_slug LIMIT 1;

  IF v_target IS NOT NULL AND v_target IS DISTINCT FROM v_current_status THEN
    PERFORM set_config('app.status_note', v_note, true);
    UPDATE public.orders SET status_id = v_target WHERE id = v_order_id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_order_status_on_po_status ON public.production_orders;
CREATE TRIGGER trg_sync_order_status_on_po_status
AFTER UPDATE OF status ON public.production_orders
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.sync_order_status_on_po_status();

-- 4) Ajuste retroactivo — recalcula todas las ventas en flujo temprano
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT o.id, o.brand_id, o.status_id, os.slug,
           (SELECT COUNT(*) FROM public.order_items oi WHERE oi.order_id = o.id) AS total,
           (SELECT COUNT(*) FROM public.order_items oi WHERE oi.order_id = o.id AND oi.production_order_id IS NOT NULL) AS sent,
           (SELECT COUNT(*) FROM public.order_items oi
              WHERE oi.order_id = o.id
                AND oi.production_order_id IS NOT NULL
                AND EXISTS (SELECT 1 FROM public.production_orders po
                             WHERE po.id = oi.production_order_id
                               AND po.status NOT IN ('pendiente','rechazada','cancelado'))) AS approved
      FROM public.orders o
      JOIN public.order_statuses os ON os.id = o.status_id
     WHERE os.slug IN ('pendiente-planimetria','confirmado',
                       'pendiente-aprobacion-produccion','en-produccion-parcial','en-produccion')
  LOOP
    DECLARE
      v_target_slug text;
      v_target uuid;
    BEGIN
      IF r.total = 0 OR r.sent = 0 THEN CONTINUE; END IF;
      IF r.approved = 0 THEN v_target_slug := 'pendiente-aprobacion-produccion';
      ELSIF r.approved < r.total THEN v_target_slug := 'en-produccion-parcial';
      ELSE v_target_slug := 'en-produccion';
      END IF;

      SELECT id INTO v_target FROM public.order_statuses
       WHERE brand_id = r.brand_id AND slug = v_target_slug LIMIT 1;
      IF v_target IS NOT NULL AND v_target IS DISTINCT FROM r.status_id THEN
        PERFORM set_config('app.status_note','Ajuste retroactivo del flujo de estados.', true);
        UPDATE public.orders SET status_id = v_target WHERE id = r.id;
      END IF;
    END;
  END LOOP;
END $$;
