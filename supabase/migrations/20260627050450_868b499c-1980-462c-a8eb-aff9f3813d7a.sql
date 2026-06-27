CREATE OR REPLACE FUNCTION public.admin_wipe_transactional_data(p_confirm text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb := '{}'::jsonb;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Solo administradores pueden ejecutar esta acción';
  END IF;
  IF p_confirm <> 'LIMPIAR BASE DE DATOS' THEN
    RAISE EXCEPTION 'Confirmación inválida';
  END IF;

  -- Children first to respect FKs. Use WHERE true to bypass safe-update guard.
  DELETE FROM public.order_audit_log WHERE true; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('order_audit_log', v_count);

  DELETE FROM public.order_status_history WHERE true; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('order_status_history', v_count);

  DELETE FROM public.order_collection_followups WHERE true; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('order_collection_followups', v_count);

  DELETE FROM public.order_payments WHERE true; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('order_payments', v_count);

  DELETE FROM public.order_item_supplier_payments WHERE true; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('order_item_supplier_payments', v_count);

  DELETE FROM public.invoice_versions WHERE true; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('invoice_versions', v_count);

  DELETE FROM public.invoices WHERE true; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('invoices', v_count);

  DELETE FROM public.warehouse_movements WHERE true; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('warehouse_movements', v_count);

  DELETE FROM public.real_production_audit_log WHERE true; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('real_production_audit_log', v_count);

  DELETE FROM public.real_production_orders WHERE true; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('real_production_orders', v_count);

  DELETE FROM public.production_planimetries WHERE true; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('production_planimetries', v_count);

  DELETE FROM public.production_audit_log WHERE true; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('production_audit_log', v_count);

  DELETE FROM public.seller_tasks WHERE true; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('seller_tasks', v_count);

  -- Clear items references to production orders to avoid trigger interference
  UPDATE public.order_items SET production_order_id = NULL WHERE production_order_id IS NOT NULL;

  DELETE FROM public.production_orders WHERE true; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('production_orders', v_count);

  DELETE FROM public.production_deletions WHERE true; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('production_deletions', v_count);

  DELETE FROM public.order_deletions WHERE true; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('order_deletions', v_count);

  DELETE FROM public.order_items WHERE true; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('order_items', v_count);

  DELETE FROM public.orders WHERE true; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('orders', v_count);

  DELETE FROM public.customers WHERE true; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('customers', v_count);

  RETURN v_result;
END;
$$;