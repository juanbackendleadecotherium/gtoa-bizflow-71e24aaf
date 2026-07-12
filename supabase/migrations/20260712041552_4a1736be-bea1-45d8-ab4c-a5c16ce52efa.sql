
-- A. Extender check constraint de sale_type
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_sale_type_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_sale_type_check
  CHECK (sale_type = ANY (ARRAY['normal','plan_separe','pago_paulatino','entrega_inmediata']::text[]));

-- B. Insertar los 4 nuevos estados por marca (si no existen)
INSERT INTO public.order_statuses (brand_id, name, slug, color, sort_order, is_active, is_initial, is_final)
SELECT b.id, 'Pendiente de pago (Entrega inmediata)', 'ei-pendiente-pago', '#06b6d4', 50, true, false, false
FROM public.brands b
WHERE b.is_active = true
  AND NOT EXISTS (SELECT 1 FROM public.order_statuses s WHERE s.brand_id = b.id AND s.slug = 'ei-pendiente-pago');

INSERT INTO public.order_statuses (brand_id, name, slug, color, sort_order, is_active, is_initial, is_final)
SELECT b.id, 'Lista para entrega', 'ei-lista-entrega', '#14b8a6', 51, true, false, false
FROM public.brands b
WHERE b.is_active = true
  AND NOT EXISTS (SELECT 1 FROM public.order_statuses s WHERE s.brand_id = b.id AND s.slug = 'ei-lista-entrega');

INSERT INTO public.order_statuses (brand_id, name, slug, color, sort_order, is_active, is_initial, is_final)
SELECT b.id, 'En entrega / En ruta', 'ei-en-ruta', '#0ea5e9', 52, true, false, false
FROM public.brands b
WHERE b.is_active = true
  AND NOT EXISTS (SELECT 1 FROM public.order_statuses s WHERE s.brand_id = b.id AND s.slug = 'ei-en-ruta');

INSERT INTO public.order_statuses (brand_id, name, slug, color, sort_order, is_active, is_initial, is_final)
SELECT b.id, 'Entregada (Entrega inmediata)', 'ei-entregada', '#16a34a', 53, true, false, true
FROM public.brands b
WHERE b.is_active = true
  AND NOT EXISTS (SELECT 1 FROM public.order_statuses s WHERE s.brand_id = b.id AND s.slug = 'ei-entregada');

-- C. Excluir entrega_inmediata del trigger de aprobación automática
CREATE OR REPLACE FUNCTION public.tg_orders_auto_require_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.sale_type = 'normal'
     AND COALESCE(NEW.total,0) > 0
     AND COALESCE(NEW.advance_amount,0) < NEW.total * 0.5 - 0.01
     AND COALESCE(NEW.approval_status, 'no_requerida') = 'no_requerida' THEN
    NEW.requires_management_approval := true;
    NEW.approval_status := 'pendiente';
    NEW.approval_requested_at := COALESCE(NEW.approval_requested_at, now());
    NEW.approval_requested_by := COALESCE(NEW.approval_requested_by, NEW.created_by);
    NEW.approval_note := COALESCE(NEW.approval_note,
      'Anticipo por debajo del 50% al crear la venta.');
  END IF;
  RETURN NEW;
END $function$;

-- D. Nuevo trigger: flujo de entrega inmediata (estado inicial + auto-transición al 50%)
CREATE OR REPLACE FUNCTION public.tg_orders_entrega_inmediata_flow()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pending_id uuid;
  v_ready_id uuid;
  v_current_slug text;
  v_total numeric;
  v_advance numeric;
BEGIN
  IF NEW.sale_type IS DISTINCT FROM 'entrega_inmediata' THEN
    RETURN NEW;
  END IF;

  -- Estado inicial en INSERT
  IF TG_OP = 'INSERT' THEN
    SELECT id INTO v_pending_id FROM public.order_statuses
      WHERE brand_id = NEW.brand_id AND slug = 'ei-pendiente-pago' AND is_active = true
      LIMIT 1;
    IF v_pending_id IS NOT NULL THEN
      NEW.status_id := v_pending_id;
    END IF;
    -- Entrega inmediata nunca requiere aprobación gerencial
    NEW.requires_management_approval := false;
    NEW.approval_status := 'no_requerida';
    NEW.approval_requested_at := NULL;
    NEW.approval_requested_by := NULL;
    NEW.approval_note := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE: si alcanzó el 50%, mover a "Lista para entrega"
  v_total := COALESCE(NEW.total, 0);
  v_advance := COALESCE(NEW.advance_amount, 0);

  IF v_total > 0 AND v_advance >= v_total * 0.5 - 0.01 THEN
    SELECT slug INTO v_current_slug FROM public.order_statuses WHERE id = NEW.status_id;
    IF v_current_slug = 'ei-pendiente-pago' THEN
      SELECT id INTO v_ready_id FROM public.order_statuses
        WHERE brand_id = NEW.brand_id AND slug = 'ei-lista-entrega' AND is_active = true
        LIMIT 1;
      IF v_ready_id IS NOT NULL THEN
        NEW.status_id := v_ready_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_orders_entrega_inmediata_flow ON public.orders;
CREATE TRIGGER tg_orders_entrega_inmediata_flow
  BEFORE INSERT OR UPDATE OF sale_type, advance_amount, total ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_orders_entrega_inmediata_flow();

-- E. Permitir agendar logística para entrega inmediata (Lista para entrega / En ruta) sin exigir saldo=0
CREATE OR REPLACE FUNCTION public.invoice_can_schedule_logistics(_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS(
    SELECT 1
    FROM public.orders o
    JOIN public.order_statuses s ON s.id = o.status_id
    LEFT JOIN (
      SELECT order_id, SUM(amount) AS payments_total
      FROM public.order_payments
      GROUP BY order_id
    ) p ON p.order_id = o.id
    WHERE o.id = _order_id
      AND (
        -- Flujo normal / plan_separe / paulatino: saldo cero + estado listo para logística
        (
          s.slug IN ('pendiente-por-logistica','pendiente_por_logistica','terminado')
          AND GREATEST(o.total - COALESCE(o.advance_amount,0) - COALESCE(p.payments_total,0), 0) = 0
        )
        OR
        -- Flujo entrega inmediata: basta con estar en "Lista para entrega" o "En ruta"
        (
          o.sale_type = 'entrega_inmediata'
          AND s.slug IN ('ei-lista-entrega','ei-en-ruta')
        )
      )
  );
$function$;

-- F. Bloqueo duro: no se pueden crear production_orders para entrega_inmediata
CREATE OR REPLACE FUNCTION public.tg_production_orders_block_entrega_inmediata()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_type text;
BEGIN
  SELECT sale_type INTO v_type FROM public.orders WHERE id = NEW.order_id;
  IF v_type = 'entrega_inmediata' THEN
    RAISE EXCEPTION 'Las ventas de entrega inmediata no requieren orden de producción';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_production_orders_block_entrega_inmediata ON public.production_orders;
CREATE TRIGGER tg_production_orders_block_entrega_inmediata
  BEFORE INSERT ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_production_orders_block_entrega_inmediata();

-- G. Al marcar un pickup como entregada, cerrar la venta de entrega inmediata
CREATE OR REPLACE FUNCTION public.tg_pickup_orders_mark_entregada_inmediata()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_type text;
  v_brand uuid;
  v_final_id uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM 'entregada' OR OLD.status = 'entregada' THEN
    RETURN NEW;
  END IF;
  IF NEW.order_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT sale_type, brand_id INTO v_type, v_brand
    FROM public.orders WHERE id = NEW.order_id;
  IF v_type <> 'entrega_inmediata' THEN
    RETURN NEW;
  END IF;
  SELECT id INTO v_final_id FROM public.order_statuses
    WHERE brand_id = v_brand AND slug = 'ei-entregada' AND is_active = true
    LIMIT 1;
  IF v_final_id IS NOT NULL THEN
    UPDATE public.orders SET status_id = v_final_id, updated_at = now()
      WHERE id = NEW.order_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_pickup_orders_mark_entregada_inmediata ON public.pickup_orders;
CREATE TRIGGER tg_pickup_orders_mark_entregada_inmediata
  AFTER UPDATE OF status ON public.pickup_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_pickup_orders_mark_entregada_inmediata();
