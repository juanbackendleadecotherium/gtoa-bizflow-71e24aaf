
-- ============ Suppliers ============
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  name text NOT NULL,
  category text,
  contact_name text,
  phone text,
  email text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX suppliers_brand_idx ON public.suppliers(brand_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View suppliers by brand access" ON public.suppliers FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), brand_id));
CREATE POLICY "Insert suppliers (admin or ventas)" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (public.can_write_brand(auth.uid(), brand_id));
CREATE POLICY "Update suppliers (admin or ventas)" ON public.suppliers FOR UPDATE TO authenticated USING (public.can_write_brand(auth.uid(), brand_id));
CREATE POLICY "Delete suppliers (admin only)" ON public.suppliers FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Brand production settings ============
CREATE TABLE public.brand_production_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL UNIQUE,
  min_margin_pct numeric(5,2) NOT NULL DEFAULT 45,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_production_settings TO authenticated;
GRANT ALL ON public.brand_production_settings TO service_role;
ALTER TABLE public.brand_production_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View bps by brand access" ON public.brand_production_settings FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), brand_id));
CREATE POLICY "Insert bps (admin)" ON public.brand_production_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Update bps (admin)" ON public.brand_production_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Delete bps (admin)" ON public.brand_production_settings FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER bps_updated_at BEFORE UPDATE ON public.brand_production_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Real production orders ============
CREATE TABLE public.real_production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  order_id uuid NOT NULL,
  code text NOT NULL,
  stage text NOT NULL DEFAULT 'planimetria',
  planimetry_ok boolean NOT NULL DEFAULT false,
  supplier_id uuid,
  supplier_cost numeric(14,2),
  sale_total_snapshot numeric(14,2) NOT NULL DEFAULT 0,
  margin_pct numeric(6,2),
  supplier_approved boolean NOT NULL DEFAULT false,
  delivery_target text,
  qc_ok boolean NOT NULL DEFAULT false,
  notes text,
  completed_at timestamptz,
  delivered_at timestamptz,
  created_by uuid,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rpo_brand_idx ON public.real_production_orders(brand_id);
CREATE INDEX rpo_order_idx ON public.real_production_orders(order_id);
CREATE INDEX rpo_stage_idx ON public.real_production_orders(stage);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.real_production_orders TO authenticated;
GRANT ALL ON public.real_production_orders TO service_role;
ALTER TABLE public.real_production_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View rpo by brand access" ON public.real_production_orders FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), brand_id));
CREATE POLICY "Insert rpo (admin or ventas)" ON public.real_production_orders FOR INSERT TO authenticated WITH CHECK (public.can_write_brand(auth.uid(), brand_id));
CREATE POLICY "Update rpo (admin or ventas)" ON public.real_production_orders FOR UPDATE TO authenticated USING (public.can_write_brand(auth.uid(), brand_id));
CREATE POLICY "Delete rpo (admin)" ON public.real_production_orders FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER rpo_updated_at BEFORE UPDATE ON public.real_production_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Code generator
CREATE OR REPLACE FUNCTION public.assign_real_production_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  brand_slug text;
  yr text;
  next_seq int;
  prefix text;
BEGIN
  IF NEW.code IS NOT NULL AND length(NEW.code) > 0 THEN RETURN NEW; END IF;
  SELECT upper(slug) INTO brand_slug FROM public.brands WHERE id = NEW.brand_id;
  yr := to_char(now(), 'YYYY');
  prefix := 'RP-' || brand_slug || '-' || yr || '-';
  SELECT COALESCE(MAX(NULLIF(regexp_replace(code, '^' || prefix, ''), '')::int), 0) + 1
    INTO next_seq
    FROM public.real_production_orders
    WHERE brand_id = NEW.brand_id AND code LIKE prefix || '%';
  NEW.code := prefix || lpad(next_seq::text, 5, '0');
  RETURN NEW;
END;
$$;
CREATE TRIGGER rpo_assign_code BEFORE INSERT ON public.real_production_orders FOR EACH ROW EXECUTE FUNCTION public.assign_real_production_code();

-- Creator stamp
CREATE OR REPLACE FUNCTION public.set_real_production_creator()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  IF NEW.created_by_email IS NULL THEN
    SELECT email INTO NEW.created_by_email FROM public.profiles WHERE user_id = NEW.created_by LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER rpo_set_creator BEFORE INSERT ON public.real_production_orders FOR EACH ROW EXECUTE FUNCTION public.set_real_production_creator();

-- Margin auto-compute + completed/delivered stamps
CREATE OR REPLACE FUNCTION public.compute_real_production_margin()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.supplier_cost IS NOT NULL AND NEW.sale_total_snapshot IS NOT NULL AND NEW.sale_total_snapshot > 0 THEN
    NEW.margin_pct := round(((NEW.sale_total_snapshot - NEW.supplier_cost) / NEW.sale_total_snapshot) * 100, 2);
  ELSE
    NEW.margin_pct := NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.stage = 'terminado' AND (OLD.stage IS DISTINCT FROM 'terminado') AND NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
    IF NEW.stage = 'entregado' AND (OLD.stage IS DISTINCT FROM 'entregado') AND NEW.delivered_at IS NULL THEN
      NEW.delivered_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER rpo_compute_margin BEFORE INSERT OR UPDATE ON public.real_production_orders FOR EACH ROW EXECUTE FUNCTION public.compute_real_production_margin();

-- ============ Real production audit log ============
CREATE TABLE public.real_production_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  real_production_order_id uuid NOT NULL REFERENCES public.real_production_orders(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL,
  action text NOT NULL,
  field text,
  old_value jsonb,
  new_value jsonb,
  note text,
  changed_by uuid,
  changed_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rpal_rpo_idx ON public.real_production_audit_log(real_production_order_id);
GRANT SELECT, INSERT ON public.real_production_audit_log TO authenticated;
GRANT ALL ON public.real_production_audit_log TO service_role;
ALTER TABLE public.real_production_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View rpal by brand" ON public.real_production_audit_log FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), brand_id));

CREATE OR REPLACE FUNCTION public.log_real_production_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  uid uuid := auth.uid();
  uemail text;
BEGIN
  SELECT email INTO uemail FROM public.profiles WHERE user_id = uid LIMIT 1;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.real_production_audit_log(real_production_order_id, brand_id, action, new_value, changed_by, changed_by_email)
    VALUES (NEW.id, NEW.brand_id, 'create',
      jsonb_build_object('code', NEW.code, 'stage', NEW.stage), uid, uemail);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.stage IS DISTINCT FROM OLD.stage THEN
      INSERT INTO public.real_production_audit_log(real_production_order_id, brand_id, action, field, old_value, new_value, changed_by, changed_by_email)
      VALUES (NEW.id, NEW.brand_id, 'stage', 'stage', to_jsonb(OLD.stage), to_jsonb(NEW.stage), uid, uemail);
    END IF;
    IF NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN
      INSERT INTO public.real_production_audit_log(real_production_order_id, brand_id, action, field, old_value, new_value, changed_by, changed_by_email)
      VALUES (NEW.id, NEW.brand_id, 'update', 'supplier_id', to_jsonb(OLD.supplier_id), to_jsonb(NEW.supplier_id), uid, uemail);
    END IF;
    IF NEW.supplier_cost IS DISTINCT FROM OLD.supplier_cost THEN
      INSERT INTO public.real_production_audit_log(real_production_order_id, brand_id, action, field, old_value, new_value, changed_by, changed_by_email)
      VALUES (NEW.id, NEW.brand_id, 'update', 'supplier_cost', to_jsonb(OLD.supplier_cost), to_jsonb(NEW.supplier_cost), uid, uemail);
    END IF;
    IF NEW.supplier_approved IS DISTINCT FROM OLD.supplier_approved THEN
      INSERT INTO public.real_production_audit_log(real_production_order_id, brand_id, action, field, old_value, new_value, changed_by, changed_by_email)
      VALUES (NEW.id, NEW.brand_id, 'update', 'supplier_approved', to_jsonb(OLD.supplier_approved), to_jsonb(NEW.supplier_approved), uid, uemail);
    END IF;
    IF NEW.delivery_target IS DISTINCT FROM OLD.delivery_target THEN
      INSERT INTO public.real_production_audit_log(real_production_order_id, brand_id, action, field, old_value, new_value, changed_by, changed_by_email)
      VALUES (NEW.id, NEW.brand_id, 'update', 'delivery_target', to_jsonb(OLD.delivery_target), to_jsonb(NEW.delivery_target), uid, uemail);
    END IF;
    IF NEW.qc_ok IS DISTINCT FROM OLD.qc_ok THEN
      INSERT INTO public.real_production_audit_log(real_production_order_id, brand_id, action, field, old_value, new_value, changed_by, changed_by_email)
      VALUES (NEW.id, NEW.brand_id, 'update', 'qc_ok', to_jsonb(OLD.qc_ok), to_jsonb(NEW.qc_ok), uid, uemail);
    END IF;
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      INSERT INTO public.real_production_audit_log(real_production_order_id, brand_id, action, field, old_value, new_value, changed_by, changed_by_email)
      VALUES (NEW.id, NEW.brand_id, 'update', 'notes', to_jsonb(OLD.notes), to_jsonb(NEW.notes), uid, uemail);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER rpo_log_changes AFTER INSERT OR UPDATE ON public.real_production_orders FOR EACH ROW EXECUTE FUNCTION public.log_real_production_changes();
