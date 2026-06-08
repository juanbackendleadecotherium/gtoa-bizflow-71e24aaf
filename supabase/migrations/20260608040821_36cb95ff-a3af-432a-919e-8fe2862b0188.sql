
-- 1) NOVEDAD enum
DO $$ BEGIN
  CREATE TYPE public.production_novedad AS ENUM ('pendiente','cotizando','produccion','entrega_inmediata','entregada','anulada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Extend production_orders
ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS supplier_id uuid,
  ADD COLUMN IF NOT EXISTS production_owner_id uuid,
  ADD COLUMN IF NOT EXISTS invoice_date date,
  ADD COLUMN IF NOT EXISTS planimetry_sent_date date,
  ADD COLUMN IF NOT EXISTS quotation_date date,
  ADD COLUMN IF NOT EXISTS production_start_date date,
  ADD COLUMN IF NOT EXISTS supplier_promised_date date,
  ADD COLUMN IF NOT EXISTS supplier_actual_date date,
  ADD COLUMN IF NOT EXISTS client_promised_date date,
  ADD COLUMN IF NOT EXISTS client_actual_date date,
  ADD COLUMN IF NOT EXISTS manufacturing_cost numeric(14,2),
  ADD COLUMN IF NOT EXISTS margin_pct numeric(6,2),
  ADD COLUMN IF NOT EXISTS novedad public.production_novedad NOT NULL DEFAULT 'pendiente';

CREATE INDEX IF NOT EXISTS idx_production_orders_brand_novedad ON public.production_orders(brand_id, novedad);
CREATE INDEX IF NOT EXISTS idx_production_orders_supplier ON public.production_orders(supplier_id);

-- 3) Margin trigger on production_orders
CREATE OR REPLACE FUNCTION public.compute_production_margin()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_total numeric;
BEGIN
  IF NEW.manufacturing_cost IS NOT NULL AND NEW.order_id IS NOT NULL THEN
    SELECT total INTO v_total FROM public.orders WHERE id = NEW.order_id;
    IF v_total IS NOT NULL AND v_total > 0 THEN
      NEW.margin_pct := round(((v_total - NEW.manufacturing_cost) / v_total) * 100, 2);
    ELSE
      NEW.margin_pct := NULL;
    END IF;
  ELSE
    NEW.margin_pct := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_compute_production_margin ON public.production_orders;
CREATE TRIGGER trg_compute_production_margin
  BEFORE INSERT OR UPDATE OF manufacturing_cost, order_id ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.compute_production_margin();

-- 4) seller_tasks table
CREATE TABLE IF NOT EXISTS public.seller_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  order_id uuid,
  production_order_id uuid,
  brand_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'fix_planimetry',
  title text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pendiente',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_tasks TO authenticated;
GRANT ALL ON public.seller_tasks TO service_role;
ALTER TABLE public.seller_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own tasks or admin or brand access" ON public.seller_tasks
  FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role) OR has_brand_access(auth.uid(), brand_id));

CREATE POLICY "Insert tasks (admin or ventas)" ON public.seller_tasks
  FOR INSERT TO authenticated
  WITH CHECK (can_write_brand(auth.uid(), brand_id));

CREATE POLICY "Update own tasks or admin or ventas" ON public.seller_tasks
  FOR UPDATE TO authenticated
  USING (seller_id = auth.uid() OR can_write_brand(auth.uid(), brand_id));

CREATE POLICY "Delete tasks (admin only)" ON public.seller_tasks
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_seller_tasks_seller_status ON public.seller_tasks(seller_id, status);
CREATE INDEX IF NOT EXISTS idx_seller_tasks_production ON public.seller_tasks(production_order_id);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_seller_tasks_updated ON public.seller_tasks;
CREATE TRIGGER trg_seller_tasks_updated
  BEFORE UPDATE ON public.seller_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Trigger: on production_orders status -> 'rechazada' create seller task
CREATE OR REPLACE FUNCTION public.create_task_on_production_reject()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seller uuid;
  v_reason text;
BEGIN
  IF NEW.status = 'rechazada' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'rechazada') THEN
    SELECT seller_id INTO v_seller FROM public.orders WHERE id = NEW.order_id;
    IF v_seller IS NULL THEN RETURN NEW; END IF;
    SELECT note INTO v_reason FROM public.production_audit_log
      WHERE production_order_id = NEW.id AND action = 'rejected'
      ORDER BY created_at DESC LIMIT 1;
    INSERT INTO public.seller_tasks(seller_id, order_id, production_order_id, brand_id, type, title, reason)
    VALUES (v_seller, NEW.order_id, NEW.id, NEW.brand_id, 'fix_planimetry',
      'Corregir planimetría rechazada (' || NEW.code || ')', v_reason);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_create_task_on_reject ON public.production_orders;
CREATE TRIGGER trg_create_task_on_reject
  AFTER INSERT OR UPDATE OF status ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.create_task_on_production_reject();

-- 6) Trigger: on new planimetry version, resolve pending fix_planimetry tasks
CREATE OR REPLACE FUNCTION public.resolve_tasks_on_planimetry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.seller_tasks
     SET status = 'resuelta', resolved_at = now(), updated_at = now()
   WHERE production_order_id = NEW.production_order_id
     AND type = 'fix_planimetry'
     AND status = 'pendiente';
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_resolve_tasks_on_planimetry ON public.production_planimetries;
CREATE TRIGGER trg_resolve_tasks_on_planimetry
  AFTER INSERT ON public.production_planimetries
  FOR EACH ROW EXECUTE FUNCTION public.resolve_tasks_on_planimetry();
