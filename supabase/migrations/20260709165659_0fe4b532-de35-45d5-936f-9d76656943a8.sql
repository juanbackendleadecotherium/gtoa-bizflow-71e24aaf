
-- 1) start_real_production: quitar el guard de pago anticipado obligatorio
CREATE OR REPLACE FUNCTION public.start_real_production(
  p_item_id uuid,
  p_started_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_item public.order_items%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_po public.production_orders%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
  v_remaining int;
  v_title text;
  v_reason text;
  v_started timestamptz;
  v_due date;
BEGIN
  SELECT * INTO v_item FROM public.order_items WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
  IF v_item.production_started_at IS NOT NULL THEN
    RETURN; -- idempotente
  END IF;

  -- Resolve effective start (default = now). Ya NO exige pago anticipado.
  v_started := COALESCE(p_started_at, now());

  UPDATE public.order_items SET production_started_at = v_started WHERE id = p_item_id;

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id;
  IF v_item.supplier_id IS NOT NULL THEN
    SELECT * INTO v_supplier FROM public.suppliers WHERE id = v_item.supplier_id;
  END IF;
  IF v_item.production_order_id IS NOT NULL THEN
    SELECT * INTO v_po FROM public.production_orders WHERE id = v_item.production_order_id;
  END IF;

  IF v_order.estimated_delivery_date IS NOT NULL THEN
    DECLARE
      d date := v_order.estimated_delivery_date;
      n int := 3;
    BEGIN
      WHILE n > 0 LOOP
        d := d - 1;
        IF EXTRACT(ISODOW FROM d) < 6 THEN
          n := n - 1;
        END IF;
      END LOOP;
      v_due := d;
    END;
    UPDATE public.order_items SET production_due_date = v_due WHERE id = p_item_id;
  END IF;

  IF v_order.seller_id IS NOT NULL THEN
    v_title := 'Tu producto empezó a producirse';
    v_reason := 'Ítem ' || COALESCE(split_part(v_item.description, E'\n', 1), 'Producto') ||
                ' inició producción' ||
                CASE WHEN v_supplier.name IS NOT NULL THEN ' con ' || v_supplier.name ELSE '' END ||
                '. Fecha estimada de entrega: ' ||
                COALESCE(to_char(v_order.estimated_delivery_date, 'DD/MM/YYYY'),
                         to_char(v_due, 'DD/MM/YYYY'),
                         'por definir') ||
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

  IF v_item.production_order_id IS NOT NULL THEN
    SELECT count(*) INTO v_remaining
      FROM public.order_items
     WHERE production_order_id = v_item.production_order_id
       AND production_started_at IS NULL;
    IF v_remaining = 0 AND v_po.production_start_date IS NULL THEN
      UPDATE public.production_orders
         SET production_start_date = v_started::date
       WHERE id = v_item.production_order_id;
    END IF;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.start_real_production(uuid, timestamptz) TO authenticated;


-- 2) notify_operativo_supplier_paid: avisa al encargado (operativo) cuando finanzas paga
CREATE OR REPLACE FUNCTION public.notify_operativo_supplier_paid(
  p_item_id uuid,
  p_amount numeric,
  p_pct numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_item public.order_items%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
  v_product text;
  v_title text;
  v_reason text;
  v_target uuid;
  v_count int := 0;
BEGIN
  SELECT * INTO v_item FROM public.order_items WHERE id = p_item_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id;
  IF v_item.supplier_id IS NOT NULL THEN
    SELECT * INTO v_supplier FROM public.suppliers WHERE id = v_item.supplier_id;
  END IF;

  v_product := COALESCE(split_part(v_item.description, E'\n', 1), 'Producto');
  v_title := 'Pago a proveedor realizado — comparte al proveedor';
  v_reason := 'Se registró un pago de $' || to_char(p_amount, 'FM999,999,999') ||
              CASE WHEN p_pct IS NOT NULL THEN ' (' || round(p_pct)::text || '% del costo)' ELSE '' END ||
              ' a ' || COALESCE(v_supplier.name, 'proveedor') ||
              ' por el producto "' || v_product || '"' ||
              CASE WHEN v_order.invoice_number IS NOT NULL
                   THEN ' · Fact. ' || v_order.invoice_number
                   ELSE ' · ' || COALESCE(v_order.order_number, '') END ||
              '. Por favor comparte esta información al proveedor para que inicie la fabricación.';

  -- Insertar una tarea para cada operativo con acceso a la marca
  FOR v_target IN
    SELECT ur.user_id
      FROM public.user_roles ur
     WHERE ur.role = 'operativo'::app_role
       AND public.has_brand_access(ur.user_id, v_order.brand_id)
  LOOP
    INSERT INTO public.seller_tasks(
      seller_id, order_id, production_order_id, order_item_id, brand_id,
      type, title, reason, severity, status
    ) VALUES (
      v_target, v_order.id, v_item.production_order_id, v_item.id, v_order.brand_id,
      'supplier_paid_notify', v_title, v_reason, 'info', 'pendiente'
    );
    v_count := v_count + 1;
  END LOOP;

  -- Fallback: si no hay operativo, notificar a los admin con acceso a la marca
  IF v_count = 0 THEN
    FOR v_target IN
      SELECT ur.user_id
        FROM public.user_roles ur
       WHERE ur.role = 'admin'::app_role
         AND public.has_brand_access(ur.user_id, v_order.brand_id)
    LOOP
      INSERT INTO public.seller_tasks(
        seller_id, order_id, production_order_id, order_item_id, brand_id,
        type, title, reason, severity, status
      ) VALUES (
        v_target, v_order.id, v_item.production_order_id, v_item.id, v_order.brand_id,
        'supplier_paid_notify', v_title, v_reason, 'info', 'pendiente'
      );
    END LOOP;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.notify_operativo_supplier_paid(uuid, numeric, numeric) TO authenticated;
