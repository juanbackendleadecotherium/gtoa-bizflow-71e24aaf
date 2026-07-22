
-- 1) Insertar estado "Cotizando" por marca (entre pendiente-aprobacion-produccion y en-produccion-parcial)
DO $$
DECLARE b RECORD; v_par int;
BEGIN
  FOR b IN SELECT id FROM public.brands LOOP
    SELECT sort_order INTO v_par FROM public.order_statuses
     WHERE brand_id = b.id AND slug = 'en-produccion-parcial';
    IF v_par IS NULL THEN CONTINUE; END IF;

    -- Desplazar parcial y en-produccion en 1 para dejar hueco
    UPDATE public.order_statuses
       SET sort_order = sort_order + 1
     WHERE brand_id = b.id AND slug IN ('en-produccion-parcial','en-produccion');

    INSERT INTO public.order_statuses (brand_id, slug, name, color, sort_order, is_initial, is_final, is_active, is_draft)
    VALUES (b.id, 'cotizando', 'Cotizando', '#f59e0b', v_par, false, false, true, false)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- 2) Actualizar sync_order_status_on_po_status para considerar novedad y mapear a cotizando/en-produccion
CREATE OR REPLACE FUNCTION public.sync_order_status_on_po_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_brand_id uuid;
  v_current_status uuid;
  v_current_slug text;
  v_total int;
  v_sent int;
  v_approved int;
  v_in_production int;
  v_in_quoting int;
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
      'pendiente-aprobacion-produccion','cotizando','en-produccion-parcial','en-produccion'
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
      ),
      COUNT(*) FILTER (
        WHERE oi.production_order_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.production_orders po
             WHERE po.id = oi.production_order_id
               AND po.status NOT IN ('pendiente','rechazada','cancelado')
               AND COALESCE(po.novedad,'pendiente') IN ('produccion','pendiente_por_logistica','entrega_inmediata','entregada')
          )
      ),
      COUNT(*) FILTER (
        WHERE oi.production_order_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.production_orders po
             WHERE po.id = oi.production_order_id
               AND po.status NOT IN ('pendiente','rechazada','cancelado')
               AND COALESCE(po.novedad,'pendiente') = 'cotizando'
          )
      )
    INTO v_total, v_sent, v_approved, v_in_production, v_in_quoting
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
    -- Todos aprobados: elegir según novedad
    IF v_in_production > 0 THEN
      v_target_slug := 'en-produccion';
      v_note := 'En producción.';
    ELSIF v_in_quoting > 0 THEN
      v_target_slug := 'cotizando';
      v_note := 'Cotizando con proveedor(es).';
    ELSE
      v_target_slug := 'pendiente-aprobacion-produccion';
      v_note := 'Aprobado por producción — pendiente de cotización.';
    END IF;
  END IF;

  SELECT id INTO v_target FROM public.order_statuses
   WHERE brand_id = v_brand_id AND slug = v_target_slug LIMIT 1;

  IF v_target IS NOT NULL AND v_target IS DISTINCT FROM v_current_status THEN
    PERFORM set_config('app.status_note', v_note, true);
    UPDATE public.orders SET status_id = v_target WHERE id = v_order_id;
  END IF;

  RETURN NEW;
END $function$;

-- Reflejar el mismo mapeo en la sincronización basada en items
CREATE OR REPLACE FUNCTION public.sync_order_status_on_production()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_brand_id uuid;
  v_current_status uuid;
  v_current_slug text;
  v_total int;
  v_sent int;
  v_approved int;
  v_in_production int;
  v_in_quoting int;
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
      'pendiente-aprobacion-produccion','cotizando','en-produccion-parcial','en-produccion'
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
      ),
      COUNT(*) FILTER (
        WHERE oi.production_order_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.production_orders po
             WHERE po.id = oi.production_order_id
               AND po.status NOT IN ('pendiente','rechazada','cancelado')
               AND COALESCE(po.novedad,'pendiente') IN ('produccion','pendiente_por_logistica','entrega_inmediata','entregada')
          )
      ),
      COUNT(*) FILTER (
        WHERE oi.production_order_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.production_orders po
             WHERE po.id = oi.production_order_id
               AND po.status NOT IN ('pendiente','rechazada','cancelado')
               AND COALESCE(po.novedad,'pendiente') = 'cotizando'
          )
      )
    INTO v_total, v_sent, v_approved, v_in_production, v_in_quoting
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
    IF v_in_production > 0 THEN
      v_target_slug := 'en-produccion';
      v_note := 'En producción.';
    ELSIF v_in_quoting > 0 THEN
      v_target_slug := 'cotizando';
      v_note := 'Cotizando con proveedor(es).';
    ELSE
      v_target_slug := 'pendiente-aprobacion-produccion';
      v_note := 'Aprobado por producción — pendiente de cotización.';
    END IF;
  END IF;

  SELECT id INTO v_target FROM public.order_statuses
   WHERE brand_id = v_brand_id AND slug = v_target_slug LIMIT 1;

  IF v_target IS NOT NULL AND v_target IS DISTINCT FROM v_current_status THEN
    PERFORM set_config('app.status_note', v_note, true);
    UPDATE public.orders SET status_id = v_target WHERE id = v_order_id;
  END IF;

  RETURN NEW;
END $function$;

-- 3) Trigger que dispare la sincronización cuando cambia la novedad
DROP TRIGGER IF EXISTS trg_sync_order_status_on_po_novedad ON public.production_orders;
CREATE TRIGGER trg_sync_order_status_on_po_novedad
AFTER UPDATE OF novedad ON public.production_orders
FOR EACH ROW WHEN (OLD.novedad IS DISTINCT FROM NEW.novedad)
EXECUTE FUNCTION public.sync_order_status_on_po_status();
