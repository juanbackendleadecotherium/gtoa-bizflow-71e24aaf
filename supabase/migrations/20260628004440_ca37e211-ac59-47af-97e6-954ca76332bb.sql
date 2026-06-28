
-- Enums for drivers and pickups
DO $$ BEGIN
  CREATE TYPE public.driver_vehicle_type AS ENUM ('propio','externo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.driver_availability AS ENUM ('disponible','en_ruta','no_disponible');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pickup_destination AS ENUM ('bodega','cliente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pickup_status AS ENUM ('pendiente','asignada','en_camino','recogida','entregada','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Drivers
CREATE TABLE IF NOT EXISTS public.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text,
  vehicle_label text,
  vehicle_type public.driver_vehicle_type NOT NULL DEFAULT 'propio',
  availability public.driver_availability NOT NULL DEFAULT 'disponible',
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.drivers TO authenticated;
GRANT ALL ON public.drivers TO service_role;

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drivers: view (authenticated)" ON public.drivers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "drivers: insert (admin or logistica)" ON public.drivers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'logistica'::app_role)
  );

CREATE POLICY "drivers: update (admin or logistica)" ON public.drivers
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'logistica'::app_role)
  );

CREATE POLICY "drivers: delete (admin only)" ON public.drivers
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));

DROP TRIGGER IF EXISTS trg_drivers_updated ON public.drivers;
CREATE TRIGGER trg_drivers_updated
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Pickup orders
CREATE TABLE IF NOT EXISTS public.pickup_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL UNIQUE REFERENCES public.order_items(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id),
  production_order_id uuid,
  supplier_id uuid,
  supplier_name_snapshot text,
  pickup_address_snapshot text,
  product_description_snapshot text,
  destination public.pickup_destination NOT NULL DEFAULT 'bodega',
  destination_warehouse_id uuid REFERENCES public.warehouses(id),
  destination_address_snapshot text,
  status public.pickup_status NOT NULL DEFAULT 'pendiente',
  driver_id uuid REFERENCES public.drivers(id),
  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  external_transport_cost numeric(14,2),
  external_transport_currency text NOT NULL DEFAULT 'COP',
  external_transport_notes text,
  notes text,
  created_by uuid,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pickup_orders TO authenticated;
GRANT ALL ON public.pickup_orders TO service_role;

ALTER TABLE public.pickup_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pickups: view" ON public.pickup_orders
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'logistica'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = pickup_orders.order_id
        AND (o.seller_id = auth.uid() OR public.has_brand_access(auth.uid(), o.brand_id))
    )
  );

CREATE POLICY "pickups: insert (admin or logistica)" ON public.pickup_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'logistica'::app_role)
  );

CREATE POLICY "pickups: update (admin or logistica)" ON public.pickup_orders
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'logistica'::app_role)
  );

CREATE POLICY "pickups: delete (admin only)" ON public.pickup_orders
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_pickup_orders_status ON public.pickup_orders(status);
CREATE INDEX IF NOT EXISTS idx_pickup_orders_brand ON public.pickup_orders(brand_id);
CREATE INDEX IF NOT EXISTS idx_pickup_orders_driver ON public.pickup_orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_pickup_orders_order ON public.pickup_orders(order_id);

DROP TRIGGER IF EXISTS trg_pickup_orders_updated ON public.pickup_orders;
CREATE TRIGGER trg_pickup_orders_updated
  BEFORE UPDATE ON public.pickup_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create pickup when an order_item is marked finished
CREATE OR REPLACE FUNCTION public.auto_create_pickup_on_item_finished()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
BEGIN
  IF NEW.production_finished_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.production_finished_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.pickup_orders WHERE order_item_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;
  IF NEW.supplier_id IS NOT NULL THEN
    SELECT * INTO v_supplier FROM public.suppliers WHERE id = NEW.supplier_id;
  END IF;

  INSERT INTO public.pickup_orders(
    order_item_id, order_id, brand_id, production_order_id,
    supplier_id, supplier_name_snapshot,
    product_description_snapshot,
    destination, status,
    created_by, created_by_email
  ) VALUES (
    NEW.id, NEW.order_id, v_order.brand_id, NEW.production_order_id,
    NEW.supplier_id, v_supplier.name,
    COALESCE(split_part(NEW.description, E'\n', 1), 'Producto'),
    'bodega', 'pendiente',
    NEW.production_finished_by, NEW.production_finished_by_email
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_pickup ON public.order_items;
CREATE TRIGGER trg_auto_create_pickup
  AFTER UPDATE OF production_finished_at ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_pickup_on_item_finished();

-- Backfill
INSERT INTO public.pickup_orders(
  order_item_id, order_id, brand_id, production_order_id,
  supplier_id, supplier_name_snapshot,
  product_description_snapshot, destination, status,
  created_by, created_by_email
)
SELECT
  oi.id, oi.order_id, o.brand_id, oi.production_order_id,
  oi.supplier_id, s.name,
  COALESCE(split_part(oi.description, E'\n', 1), 'Producto'),
  'bodega', 'pendiente',
  oi.production_finished_by, oi.production_finished_by_email
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
LEFT JOIN public.suppliers s ON s.id = oi.supplier_id
WHERE oi.production_finished_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.pickup_orders p WHERE p.order_item_id = oi.id);

-- KPI function
CREATE OR REPLACE FUNCTION public.sum_external_logistics_cost(
  _from date,
  _to date,
  _brand_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(external_transport_cost), 0)::numeric
  FROM public.pickup_orders
  WHERE external_transport_cost IS NOT NULL
    AND status = 'entregada'
    AND delivered_at::date BETWEEN _from AND _to
    AND (_brand_id IS NULL OR brand_id = _brand_id);
$$;

REVOKE EXECUTE ON FUNCTION public.sum_external_logistics_cost(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sum_external_logistics_cost(date, date, uuid) TO authenticated, service_role;

-- Realtime
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='drivers'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='pickup_orders'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pickup_orders';
  END IF;
END $$;
