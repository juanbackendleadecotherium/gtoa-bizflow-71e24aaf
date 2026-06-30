
-- 1) Trigger: cuando production_orders pasa de pendiente -> en_proceso,
--    guardar planimetry_sent_date = hoy si está vacío.
CREATE OR REPLACE FUNCTION public.set_planimetry_sent_date_on_accept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'en_proceso'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND OLD.status = 'pendiente'
     AND NEW.planimetry_sent_date IS NULL THEN
    NEW.planimetry_sent_date := current_date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_planimetry_sent_date_on_accept ON public.production_orders;
CREATE TRIGGER trg_set_planimetry_sent_date_on_accept
BEFORE UPDATE ON public.production_orders
FOR EACH ROW EXECUTE FUNCTION public.set_planimetry_sent_date_on_accept();

-- 2) Helper SQL: restar N días hábiles (lunes-viernes), espejo del helper TS.
CREATE OR REPLACE FUNCTION public.subtract_business_days(_from date, _n integer)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d date := _from;
  remaining int := _n;
BEGIN
  IF _from IS NULL OR _n IS NULL THEN RETURN NULL; END IF;
  WHILE remaining > 0 LOOP
    d := d - 1;
    IF EXTRACT(ISODOW FROM d) < 6 THEN
      remaining := remaining - 1;
    END IF;
  END LOOP;
  RETURN d;
END;
$$;

-- 3) Trigger en production_orders: al cambiar client_promised_date,
--    propagar supplier_promised_date = (client_promised_date - 3 días hábiles)
--    a los items de esa orden cuyo supplier_promised_date sea NULL o coincida
--    con el valor anterior calculado (para no pisar overrides manuales).
CREATE OR REPLACE FUNCTION public.propagate_supplier_promised_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_supplier date := public.subtract_business_days(NEW.client_promised_date, 3);
  v_old_supplier date := public.subtract_business_days(OLD.client_promised_date, 3);
BEGIN
  IF NEW.client_promised_date IS DISTINCT FROM OLD.client_promised_date THEN
    UPDATE public.order_items
       SET supplier_promised_date = v_new_supplier
     WHERE production_order_id = NEW.id
       AND (supplier_promised_date IS NULL
            OR supplier_promised_date IS NOT DISTINCT FROM v_old_supplier);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_supplier_promised_date ON public.production_orders;
CREATE TRIGGER trg_propagate_supplier_promised_date
AFTER UPDATE OF client_promised_date ON public.production_orders
FOR EACH ROW EXECUTE FUNCTION public.propagate_supplier_promised_date();

-- 4) RPC: cancelar una orden de producción (sólo cuando está pendiente).
--    Libera los productos (production_order_id := NULL) y marca la orden
--    como 'cancelado', registrando el motivo en la bitácora.
CREATE OR REPLACE FUNCTION public.cancel_production_with_reason(p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_brand uuid;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'El motivo debe tener al menos 10 caracteres';
  END IF;

  SELECT brand_id, status INTO v_brand, v_status
    FROM public.production_orders WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden de producción no encontrada'; END IF;
  IF NOT public.can_write_brand(v_uid, v_brand) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF v_status <> 'pendiente' THEN
    RAISE EXCEPTION 'Sólo se puede cancelar una orden mientras esté en estado Pendiente. Comunícate con producción por WhatsApp para cualquier cambio posterior.';
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE user_id = v_uid LIMIT 1;

  -- Bitácora con motivo (la insertamos antes para que quede ligada al cambio).
  INSERT INTO public.production_audit_log(
    production_order_id, brand_id, action, field, old_value, new_value, note,
    changed_by, changed_by_email
  ) VALUES (
    p_id, v_brand, 'cancelled', 'status',
    to_jsonb(v_status), to_jsonb('cancelado'::text),
    btrim(p_reason), v_uid, v_email
  );

  -- Libera los items para que vuelvan a aparecer como "Nuevo" en el diálogo.
  UPDATE public.order_items
     SET production_order_id = NULL
   WHERE production_order_id = p_id;

  UPDATE public.production_orders SET status = 'cancelado' WHERE id = p_id;
END;
$$;
