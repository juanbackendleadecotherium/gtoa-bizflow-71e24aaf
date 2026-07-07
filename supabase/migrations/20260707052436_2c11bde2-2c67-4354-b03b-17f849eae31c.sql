
-- 1. Nueva columna is_draft en order_statuses
ALTER TABLE public.order_statuses
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;

-- 2. Nueva columna last_draft_saved_at en orders (para autosave + alerta 7 días)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS last_draft_saved_at timestamptz;

-- 3. Seed: estado "Borrador" por marca (si no existe)
INSERT INTO public.order_statuses (brand_id, name, slug, color, is_initial, is_final, is_active, is_draft, sort_order)
SELECT b.id, 'Borrador', 'borrador', '#94a3b8', false, false, true, true, -10
FROM public.brands b
WHERE NOT EXISTS (
  SELECT 1 FROM public.order_statuses s
  WHERE s.brand_id = b.id AND s.slug = 'borrador'
);

-- 4. Función helper: ¿la orden está en borrador?
CREATE OR REPLACE FUNCTION public.order_is_draft(_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(s.is_draft, false)
  FROM public.orders o
  LEFT JOIN public.order_statuses s ON s.id = o.status_id
  WHERE o.id = _order_id
$$;

-- 5. Trigger: bloquear invoices sobre órdenes en borrador
CREATE OR REPLACE FUNCTION public.prevent_invoice_on_draft()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.order_is_draft(NEW.order_id) THEN
    RAISE EXCEPTION 'No se puede generar cuenta de cobro sobre una venta en borrador. Confirma la venta primero.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_invoice_on_draft ON public.invoices;
CREATE TRIGGER trg_prevent_invoice_on_draft
  BEFORE INSERT OR UPDATE OF order_id ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_invoice_on_draft();

-- 6. Trigger: bloquear production_orders sobre órdenes en borrador
CREATE OR REPLACE FUNCTION public.prevent_production_on_draft()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.order_is_draft(NEW.order_id) THEN
    RAISE EXCEPTION 'No se puede enviar a producción una venta en borrador. Confirma la venta primero.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_production_on_draft ON public.production_orders;
CREATE TRIGGER trg_prevent_production_on_draft
  BEFORE INSERT OR UPDATE OF order_id ON public.production_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_production_on_draft();

-- 7. Trigger: actualizar last_draft_saved_at cuando la orden está en borrador
CREATE OR REPLACE FUNCTION public.touch_last_draft_saved_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.order_is_draft(NEW.id) THEN
    NEW.last_draft_saved_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_last_draft_saved_at ON public.orders;
CREATE TRIGGER trg_touch_last_draft_saved_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_last_draft_saved_at();

-- 8. Job diario: crear seller_task para borradores con +7 días sin actividad
CREATE OR REPLACE FUNCTION public.alert_stale_drafts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.seller_tasks (seller_id, order_id, brand_id, type, title, reason, severity, status)
  SELECT
    o.seller_id,
    o.id,
    o.brand_id,
    'stale_draft',
    'Borrador sin actividad hace más de 7 días',
    format('La venta borrador %s no se ha modificado desde %s. Retómala o elimínala.',
           COALESCE(o.customer_name, 'sin cliente'),
           to_char(o.last_draft_saved_at, 'YYYY-MM-DD')),
    'medium',
    'pending'
  FROM public.orders o
  JOIN public.order_statuses s ON s.id = o.status_id
  WHERE s.is_draft = true
    AND o.seller_id IS NOT NULL
    AND COALESCE(o.last_draft_saved_at, o.created_at) < now() - INTERVAL '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.seller_tasks t
      WHERE t.order_id = o.id
        AND t.type = 'stale_draft'
        AND t.status = 'pending'
    );
END;
$$;

-- 9. Programar el job diario a las 8am (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'alert-stale-drafts-daily') THEN
    PERFORM cron.schedule(
      'alert-stale-drafts-daily',
      '0 8 * * *',
      $cron$ SELECT public.alert_stale_drafts(); $cron$
    );
  END IF;
EXCEPTION WHEN undefined_table THEN
  -- pg_cron no disponible: se puede llamar manualmente a alert_stale_drafts()
  NULL;
END $$;

-- 10. Índice para queries de borradores del vendedor
CREATE INDEX IF NOT EXISTS idx_orders_seller_last_draft
  ON public.orders (seller_id, last_draft_saved_at DESC)
  WHERE last_draft_saved_at IS NOT NULL;
