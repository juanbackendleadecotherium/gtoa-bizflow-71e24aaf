
CREATE OR REPLACE FUNCTION public.mark_task_forms_done(p_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_task public.seller_tasks%ROWTYPE;
  v_actor uuid := auth.uid();
  v_actor_email text; v_po_creator uuid; v_po_code text;
  v_invoice text; v_order_no text;
  v_title text; v_reason text; v_new_type text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT * INTO v_task FROM public.seller_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarea no encontrada'; END IF;
  IF v_task.seller_id <> v_actor THEN RAISE EXCEPTION 'No puedes marcar esta tarea'; END IF;
  IF v_task.type NOT IN ('partial_shipment','invoice_ready_for_collection') THEN
    RAISE EXCEPTION 'Tipo de tarea no soportado';
  END IF;
  SELECT email INTO v_actor_email FROM auth.users WHERE id = v_actor;
  UPDATE public.seller_tasks
     SET status='resuelta', forms_completed_at=now(), resolved_at=now(), updated_at=now()
   WHERE id = p_task_id;
  SELECT po.created_by, po.code INTO v_po_creator, v_po_code
    FROM public.production_orders po
   WHERE po.order_id = v_task.order_id
   ORDER BY po.created_at ASC LIMIT 1;
  SELECT invoice_number, order_number INTO v_invoice, v_order_no
    FROM public.orders WHERE id = v_task.order_id;
  IF v_task.type = 'partial_shipment' THEN
    v_new_type := 'partial_shipment_forms_done';
    v_title := 'Forms de entrega parcial listo — verifica logística';
    v_reason := 'El vendedor ' || COALESCE(v_actor_email,'') ||
                ' llenó el formulario de logística y confirmó el cobro del saldo para la venta ' ||
                COALESCE(v_invoice, v_order_no, '') ||
                CASE WHEN v_po_code IS NOT NULL THEN ' (OP ' || v_po_code || ')' ELSE '' END ||
                '. Puedes proceder con la entrega parcial.';
  ELSE
    v_new_type := 'invoice_collection_forms_done';
    v_title := 'Cuenta de cobro ' || COALESCE(v_invoice,'') || ' — Forms listo, procede logística';
    v_reason := 'El vendedor ' || COALESCE(v_actor_email,'') ||
                ' llenó el formulario de logística y confirmó el cobro del saldo. ' ||
                'Puedes coordinar la entrega final con el cliente.';
  END IF;
  -- Notifica siempre al creador de la OP (incluye caso en el que sea el mismo usuario,
  -- para que producción/administración siempre reciba el aviso de seguimiento).
  IF v_po_creator IS NOT NULL THEN
    INSERT INTO public.seller_tasks(
      seller_id, order_id, production_order_id, order_item_id, brand_id,
      type, title, reason, severity, status
    ) VALUES (
      v_po_creator, v_task.order_id, v_task.production_order_id, v_task.order_item_id,
      v_task.brand_id, v_new_type, v_title, v_reason, 'info', 'pendiente'
    );
  END IF;
  RETURN jsonb_build_object('ok', true);
END $function$;
