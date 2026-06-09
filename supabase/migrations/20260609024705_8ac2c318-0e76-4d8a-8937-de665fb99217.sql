
-- Revoke broad EXECUTE on SECURITY DEFINER trigger helpers; triggers run as
-- the table owner and don't depend on caller's EXECUTE grant.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname NOT IN (
        'update_order_status',
        'delete_order_with_reason',
        'delete_production_with_reason',
        'reject_production_with_reason'
      )
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
      fn.nspname, fn.proname, fn.args
    );
  END LOOP;
END $$;
