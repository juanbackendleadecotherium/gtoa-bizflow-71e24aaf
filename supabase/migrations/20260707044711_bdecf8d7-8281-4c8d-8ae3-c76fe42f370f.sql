
-- 1) Columnas
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS is_gift boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gifted_by uuid,
  ADD COLUMN IF NOT EXISTS gifted_by_email text,
  ADD COLUMN IF NOT EXISTS gifted_at timestamptz;

-- 2) set_line_total: si is_gift -> line_total = 0
CREATE OR REPLACE FUNCTION public.set_line_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(NEW.is_gift, false) THEN
    NEW.line_total := 0;
  ELSE
    NEW.line_total := COALESCE(NEW.quantity, 0) * COALESCE(NEW.unit_price, 0);
  END IF;
  RETURN NEW;
END;
$$;

-- 3) Margen ignora obsequios
CREATE OR REPLACE FUNCTION public.compute_order_item_margin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_line numeric;
BEGIN
  IF COALESCE(NEW.is_gift, false) THEN
    NEW.margin_pct := NULL;
    RETURN NEW;
  END IF;
  v_line := COALESCE(NEW.quantity, 0) * COALESCE(NEW.unit_price, 0);
  IF NEW.manufacturing_cost IS NOT NULL AND v_line > 0 THEN
    NEW.margin_pct := round(((v_line - NEW.manufacturing_cost) / v_line) * 100, 2);
  ELSE
    NEW.margin_pct := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.order_items_recalc_margin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  effective_cost numeric;
BEGIN
  IF COALESCE(NEW.is_gift, false) THEN
    NEW.margin_pct := NULL;
    RETURN NEW;
  END IF;
  effective_cost := COALESCE(NEW.negotiated_cost, NEW.manufacturing_cost);
  IF effective_cost IS NOT NULL AND NEW.line_total IS NOT NULL AND NEW.line_total > 0 THEN
    NEW.margin_pct := ((NEW.line_total - effective_cost) / NEW.line_total) * 100;
  ELSE
    NEW.margin_pct := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- 4) Trigger de auditoría + permisos para is_gift
CREATE OR REPLACE FUNCTION public.handle_order_item_gift_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_seller uuid;
  v_email text;
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(NEW.is_gift,false) IS DISTINCT FROM COALESCE(OLD.is_gift,false) THEN
    -- Autorización: admin o vendedor dueño de la orden
    IF v_uid IS NOT NULL THEN
      SELECT public.has_role(v_uid, 'admin'::app_role) INTO v_is_admin;
    END IF;
    SELECT seller_id INTO v_seller FROM public.orders WHERE id = NEW.order_id;
    IF NOT v_is_admin AND (v_seller IS DISTINCT FROM v_uid OR v_uid IS NULL) THEN
      RAISE EXCEPTION 'Solo el vendedor de la venta o un administrador pueden marcar un ítem como obsequio';
    END IF;

    IF NEW.is_gift THEN
      SELECT email INTO v_email FROM public.profiles WHERE user_id = v_uid;
      NEW.gifted_by := v_uid;
      NEW.gifted_by_email := v_email;
      NEW.gifted_at := now();
    ELSE
      NEW.gifted_by := NULL;
      NEW.gifted_by_email := NULL;
      NEW.gifted_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_item_gift_change ON public.order_items;
CREATE TRIGGER trg_order_item_gift_change
  BEFORE UPDATE OF is_gift ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_item_gift_change();

-- 5) Log en order_audit_log (best-effort)
CREATE OR REPLACE FUNCTION public.log_order_item_gift_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(NEW.is_gift,false) IS DISTINCT FROM COALESCE(OLD.is_gift,false) THEN
    BEGIN
      INSERT INTO public.order_audit_log(order_id, action, changed_by, changed_by_email, metadata, created_at)
      VALUES (
        NEW.order_id,
        CASE WHEN NEW.is_gift THEN 'item_marked_as_gift' ELSE 'item_unmarked_as_gift' END,
        NEW.gifted_by,
        NEW.gifted_by_email,
        jsonb_build_object('order_item_id', NEW.id, 'description', NEW.description, 'unit_price', NEW.unit_price, 'quantity', NEW.quantity),
        now()
      );
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      NULL;
    END;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_order_item_gift ON public.order_items;
CREATE TRIGGER trg_log_order_item_gift
  AFTER UPDATE OF is_gift ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.log_order_item_gift_change();

-- 6) Recalcular line_total y totales para filas existentes con is_gift=true (ninguna aún, pero por si acaso)
UPDATE public.order_items SET is_gift = is_gift WHERE false;
