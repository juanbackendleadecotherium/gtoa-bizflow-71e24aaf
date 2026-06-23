
-- ============================================================================
-- Warehouse control: warehouses, zones, movements
-- ============================================================================

-- 1) warehouses
CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Warehouses readable by admin/operativo"
  ON public.warehouses FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operativo'));

CREATE POLICY "Warehouses writable by admin"
  ON public.warehouses FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Warehouses update by admin"
  ON public.warehouses FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Warehouses delete by admin"
  ON public.warehouses FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_warehouses_updated_at
  BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 2) warehouse_zones
CREATE TABLE public.warehouse_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  zone_code text NOT NULL,
  description text,
  capacity_units integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, zone_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_zones TO authenticated;
GRANT ALL ON public.warehouse_zones TO service_role;
ALTER TABLE public.warehouse_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Zones readable by admin/operativo"
  ON public.warehouse_zones FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operativo'));

CREATE POLICY "Zones insert by admin"
  ON public.warehouse_zones FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Zones update by admin"
  ON public.warehouse_zones FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Zones delete by admin"
  ON public.warehouse_zones FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_warehouse_zones_updated_at
  BEFORE UPDATE ON public.warehouse_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 3) warehouse_movements
CREATE TABLE public.warehouse_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES public.warehouse_zones(id) ON DELETE RESTRICT,
  movement_type text NOT NULL CHECK (movement_type IN ('in','out')),
  moved_at timestamptz NOT NULL DEFAULT now(),
  moved_by uuid,
  moved_by_email text,
  reason text,
  client_invoice text,
  client_cedula text,
  product_quantity numeric(12,2) NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX warehouse_movements_item_id_moved_at_idx
  ON public.warehouse_movements (item_id, moved_at DESC, created_at DESC);
CREATE INDEX warehouse_movements_zone_id_idx
  ON public.warehouse_movements (zone_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_movements TO authenticated;
GRANT ALL ON public.warehouse_movements TO service_role;
ALTER TABLE public.warehouse_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Movements readable by admin/operativo"
  ON public.warehouse_movements FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operativo'));

CREATE POLICY "Movements insert by admin/operativo"
  ON public.warehouse_movements FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operativo')
  );
-- No update / delete policies: movements are append-only.


-- 4) Trigger: rellena moved_by / moved_by_email
CREATE OR REPLACE FUNCTION public.set_warehouse_movement_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.moved_by IS NULL THEN NEW.moved_by := auth.uid(); END IF;
  IF NEW.moved_by_email IS NULL THEN
    SELECT email INTO NEW.moved_by_email FROM public.profiles WHERE user_id = NEW.moved_by LIMIT 1;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_warehouse_movements_creator
  BEFORE INSERT ON public.warehouse_movements
  FOR EACH ROW EXECUTE FUNCTION public.set_warehouse_movement_creator();


-- 5) Trigger: validate single active location per item
CREATE OR REPLACE FUNCTION public.validate_warehouse_movement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_last_type text;
  v_last_zone uuid;
  v_zone_code text;
BEGIN
  -- Find the last movement for this item (chronological)
  SELECT movement_type, zone_id
    INTO v_last_type, v_last_zone
    FROM public.warehouse_movements
    WHERE item_id = NEW.item_id
    ORDER BY moved_at DESC, created_at DESC
    LIMIT 1;

  IF NEW.movement_type = 'in' THEN
    IF v_last_type = 'in' THEN
      SELECT zone_code INTO v_zone_code FROM public.warehouse_zones WHERE id = v_last_zone;
      RAISE EXCEPTION 'Este producto ya está en bodega (zona %). Registra primero la salida antes de un nuevo ingreso.', COALESCE(v_zone_code, '?')
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.movement_type = 'out' THEN
    IF v_last_type IS NULL OR v_last_type = 'out' THEN
      RAISE EXCEPTION 'Este producto no está actualmente en bodega; no se puede registrar una salida.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_last_zone IS DISTINCT FROM NEW.zone_id THEN
      SELECT zone_code INTO v_zone_code FROM public.warehouse_zones WHERE id = v_last_zone;
      RAISE EXCEPTION 'El producto está en la zona %; la salida debe registrarse desde esa zona.', COALESCE(v_zone_code, '?')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_warehouse_movements_validate
  BEFORE INSERT ON public.warehouse_movements
  FOR EACH ROW EXECUTE FUNCTION public.validate_warehouse_movement();


-- 6) View: current location per item (last movement)
CREATE OR REPLACE VIEW public.warehouse_item_locations AS
SELECT DISTINCT ON (m.item_id)
  m.item_id,
  CASE WHEN m.movement_type = 'in' THEN m.zone_id ELSE NULL END AS current_zone_id,
  m.moved_at AS last_movement_at,
  m.movement_type AS last_movement_type
FROM public.warehouse_movements m
ORDER BY m.item_id, m.moved_at DESC, m.created_at DESC;

GRANT SELECT ON public.warehouse_item_locations TO authenticated;
GRANT ALL ON public.warehouse_item_locations TO service_role;


-- 7) Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.warehouse_movements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.warehouse_zones;
ALTER PUBLICATION supabase_realtime ADD TABLE public.warehouses;
