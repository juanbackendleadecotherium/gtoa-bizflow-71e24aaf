
-- 1) Add has_phases flag to order_items
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS has_phases boolean NOT NULL DEFAULT false;

-- 2) Create order_item_phases
CREATE TABLE IF NOT EXISTS public.order_item_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  production_order_id uuid REFERENCES public.production_orders(id) ON DELETE SET NULL,
  real_production_order_id uuid REFERENCES public.real_production_orders(id) ON DELETE SET NULL,
  phase_index integer NOT NULL DEFAULT 1,
  name text NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  manufacturing_cost numeric(14,2),
  negotiated_cost numeric(14,2),
  negotiated_at timestamptz,
  negotiated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  quotation_date date,
  supplier_promised_date date,
  supplier_actual_date date,
  started_at timestamptz,
  finished_at timestamptz,
  finished_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pendiente',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_item_id, phase_index),
  CONSTRAINT order_item_phases_status_check CHECK (status IN ('pendiente','en_proceso','terminado'))
);

CREATE INDEX IF NOT EXISTS idx_oip_order_item ON public.order_item_phases(order_item_id);
CREATE INDEX IF NOT EXISTS idx_oip_supplier ON public.order_item_phases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_oip_brand ON public.order_item_phases(brand_id);
CREATE INDEX IF NOT EXISTS idx_oip_order ON public.order_item_phases(order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_item_phases TO authenticated;
GRANT ALL ON public.order_item_phases TO service_role;

ALTER TABLE public.order_item_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View phases via brand"
  ON public.order_item_phases FOR SELECT
  USING (public.has_brand_access(auth.uid(), brand_id));

CREATE POLICY "Insert phases (admin, ventas or production)"
  ON public.order_item_phases FOR INSERT
  WITH CHECK (
    public.can_write_brand(auth.uid(), brand_id)
    OR (public.has_role(auth.uid(), 'operativo'::app_role) AND public.has_brand_access(auth.uid(), brand_id))
  );

CREATE POLICY "Update phases (admin, ventas or production)"
  ON public.order_item_phases FOR UPDATE
  USING (
    public.can_write_brand(auth.uid(), brand_id)
    OR (public.has_role(auth.uid(), 'operativo'::app_role) AND public.has_brand_access(auth.uid(), brand_id))
  );

CREATE POLICY "Delete phases (admin or ventas)"
  ON public.order_item_phases FOR DELETE
  USING (public.can_write_brand(auth.uid(), brand_id));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at_order_item_phases()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oip_updated_at ON public.order_item_phases;
CREATE TRIGGER trg_oip_updated_at
  BEFORE UPDATE ON public.order_item_phases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_order_item_phases();

-- Keep order_items.has_phases in sync
CREATE OR REPLACE FUNCTION public.sync_order_item_has_phases()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_item uuid;
  v_count int;
BEGIN
  v_item := COALESCE(NEW.order_item_id, OLD.order_item_id);
  SELECT count(*) INTO v_count FROM public.order_item_phases WHERE order_item_id = v_item;
  UPDATE public.order_items SET has_phases = (v_count > 0) WHERE id = v_item;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_oip_sync_has_phases ON public.order_item_phases;
CREATE TRIGGER trg_oip_sync_has_phases
  AFTER INSERT OR DELETE ON public.order_item_phases
  FOR EACH ROW EXECUTE FUNCTION public.sync_order_item_has_phases();

-- 3) Extend order_item_supplier_payments with phase_id
ALTER TABLE public.order_item_supplier_payments
  ADD COLUMN IF NOT EXISTS phase_id uuid REFERENCES public.order_item_phases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_oisp_phase ON public.order_item_supplier_payments(phase_id);

-- 4) RPCs
CREATE OR REPLACE FUNCTION public.start_item_phase(_phase_id uuid, _started_at timestamptz DEFAULT now())
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item uuid;
  v_pending int;
BEGIN
  UPDATE public.order_item_phases
    SET status = 'en_proceso',
        started_at = COALESCE(started_at, _started_at)
    WHERE id = _phase_id
    RETURNING order_item_id INTO v_item;

  IF v_item IS NULL THEN
    RAISE EXCEPTION 'Phase % not found', _phase_id;
  END IF;

  SELECT count(*) INTO v_pending
    FROM public.order_item_phases
    WHERE order_item_id = v_item AND started_at IS NULL;

  IF v_pending = 0 THEN
    UPDATE public.order_items
      SET production_started_at = COALESCE(production_started_at, _started_at)
      WHERE id = v_item;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_item_phase(_phase_id uuid, _finished_at timestamptz DEFAULT now())
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item uuid;
  v_pending int;
BEGIN
  UPDATE public.order_item_phases
    SET status = 'terminado',
        finished_at = COALESCE(finished_at, _finished_at),
        finished_by = auth.uid()
    WHERE id = _phase_id
    RETURNING order_item_id INTO v_item;

  IF v_item IS NULL THEN
    RAISE EXCEPTION 'Phase % not found', _phase_id;
  END IF;

  SELECT count(*) INTO v_pending
    FROM public.order_item_phases
    WHERE order_item_id = v_item AND status <> 'terminado';

  IF v_pending = 0 THEN
    UPDATE public.order_items
      SET production_finished_at = COALESCE(production_finished_at, _finished_at),
          production_finished_by = COALESCE(production_finished_by, auth.uid())
      WHERE id = v_item;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_item_effective_cost(_item_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_has_phases boolean;
  v_total numeric;
BEGIN
  SELECT has_phases INTO v_has_phases FROM public.order_items WHERE id = _item_id;
  IF v_has_phases THEN
    SELECT COALESCE(SUM(COALESCE(negotiated_cost, manufacturing_cost, 0)), 0)
      INTO v_total
      FROM public.order_item_phases
      WHERE order_item_id = _item_id;
    RETURN v_total;
  ELSE
    SELECT COALESCE(negotiated_cost, manufacturing_cost, 0) INTO v_total
      FROM public.order_items WHERE id = _item_id;
    RETURN COALESCE(v_total, 0);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_item_phase(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_item_phase(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_item_effective_cost(uuid) TO authenticated;
