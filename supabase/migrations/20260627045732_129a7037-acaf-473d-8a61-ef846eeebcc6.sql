
CREATE OR REPLACE FUNCTION public.admin_preview_wipe_counts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb := '{}'::jsonb;
  v_tables text[] := ARRAY[
    'order_audit_log','order_status_history','order_collection_followups',
    'order_payments','order_item_supplier_payments','invoice_versions','invoices',
    'production_planimetries','production_audit_log','real_production_audit_log',
    'seller_tasks','warehouse_movements','order_items','production_orders',
    'real_production_orders','order_deletions','production_deletions','orders','customers'
  ];
  t text;
  c bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Solo administradores';
  END IF;
  FOREACH t IN ARRAY v_tables LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO c;
    v_result := v_result || jsonb_build_object(t, c);
  END LOOP;
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.admin_wipe_transactional_data(p_confirm text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_result jsonb := '{}'::jsonb;
  v_tables text[] := ARRAY[
    'order_audit_log','order_status_history','order_collection_followups',
    'order_payments','order_item_supplier_payments','invoice_versions','invoices',
    'production_planimetries','production_audit_log','real_production_audit_log',
    'seller_tasks','warehouse_movements','order_items','production_orders',
    'real_production_orders','order_deletions','production_deletions','orders','customers'
  ];
  t text;
  c bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Solo administradores pueden ejecutar esta acción';
  END IF;
  IF p_confirm IS DISTINCT FROM 'LIMPIAR BASE DE DATOS' THEN
    RAISE EXCEPTION 'Confirmación inválida';
  END IF;

  FOREACH t IN ARRAY v_tables LOOP
    EXECUTE format('DELETE FROM public.%I', t);
    GET DIAGNOSTICS c = ROW_COUNT;
    v_result := v_result || jsonb_build_object(t, c);
  END LOOP;

  SELECT email INTO v_email FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  INSERT INTO public.user_admin_audit(actor_user_id, actor_email, target_user_id, target_email, action, details)
  VALUES (v_uid, v_email, NULL, NULL, 'wipe_transactional_data', v_result);

  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.admin_preview_wipe_counts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_wipe_transactional_data(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_preview_wipe_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_wipe_transactional_data(text) TO authenticated;
