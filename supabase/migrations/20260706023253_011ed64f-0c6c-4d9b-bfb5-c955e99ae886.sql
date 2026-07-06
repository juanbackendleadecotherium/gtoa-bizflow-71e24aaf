DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='orders') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.orders';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='seller_tasks') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.seller_tasks';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='order_approval_log') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.order_approval_log';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='order_payments') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.order_payments';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='invoices') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices';
  END IF;
END $$;

ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.seller_tasks REPLICA IDENTITY FULL;