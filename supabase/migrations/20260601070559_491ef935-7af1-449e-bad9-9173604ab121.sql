-- ============================================================================
-- HITO 3 — Producción y planimetrías
-- ============================================================================

-- 1) Tabla principal: órdenes de producción ligadas a ventas
CREATE TABLE public.production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  code text NOT NULL,
  workshop text,
  assigned_to uuid,
  assigned_to_label text,
  status text NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente','en_proceso','control_calidad','listo','entregado','cancelado')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('baja','normal','alta','urgente')),
  start_date date,
  due_date date,
  completed_at timestamptz,
  notes text,
  created_by uuid,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, code)
);

CREATE INDEX idx_production_orders_order ON public.production_orders(order_id);
CREATE INDEX idx_production_orders_brand_status ON public.production_orders(brand_id, status);
CREATE INDEX idx_production_orders_due ON public.production_orders(due_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_orders TO authenticated;
GRANT ALL ON public.production_orders TO service_role;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View production by brand access"
  ON public.production_orders FOR SELECT TO authenticated
  USING (has_brand_access(auth.uid(), brand_id));
CREATE POLICY "Insert production (admin or ventas)"
  ON public.production_orders FOR INSERT TO authenticated
  WITH CHECK (can_write_brand(auth.uid(), brand_id));
CREATE POLICY "Update production (admin or ventas)"
  ON public.production_orders FOR UPDATE TO authenticated
  USING (can_write_brand(auth.uid(), brand_id));
CREATE POLICY "Delete production (admin only)"
  ON public.production_orders FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 2) Planimetrías (archivos adjuntos por orden de producción)
CREATE TABLE public.production_planimetries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL,
  file_url text NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  mime_type text,
  version integer NOT NULL DEFAULT 1,
  notes text,
  uploaded_by uuid,
  uploaded_by_email text,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_planimetries_prod ON public.production_planimetries(production_order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_planimetries TO authenticated;
GRANT ALL ON public.production_planimetries TO service_role;
ALTER TABLE public.production_planimetries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View planimetries by brand"
  ON public.production_planimetries FOR SELECT TO authenticated
  USING (has_brand_access(auth.uid(), brand_id));
CREATE POLICY "Insert planimetries (admin or ventas)"
  ON public.production_planimetries FOR INSERT TO authenticated
  WITH CHECK (can_write_brand(auth.uid(), brand_id));
CREATE POLICY "Update planimetries (admin or ventas)"
  ON public.production_planimetries FOR UPDATE TO authenticated
  USING (can_write_brand(auth.uid(), brand_id));
CREATE POLICY "Delete planimetries (admin only)"
  ON public.production_planimetries FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 3) Auditoría / bitácora de la orden de producción
CREATE TABLE public.production_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id uuid NOT NULL,
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

CREATE INDEX idx_production_audit_prod ON public.production_audit_log(production_order_id);

GRANT SELECT ON public.production_audit_log TO authenticated;
GRANT ALL ON public.production_audit_log TO service_role;
ALTER TABLE public.production_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View production audit by brand"
  ON public.production_audit_log FOR SELECT TO authenticated
  USING (has_brand_access(auth.uid(), brand_id));

-- 4) Auto-asignar código PROD-{BRAND}-{YYYY}-{seq}
CREATE OR REPLACE FUNCTION public.assign_production_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  brand_slug text;
  yr text;
  next_seq int;
  prefix text;
BEGIN
  IF NEW.code IS NOT NULL AND length(NEW.code) > 0 THEN
    RETURN NEW;
  END IF;
  SELECT upper(slug) INTO brand_slug FROM public.brands WHERE id = NEW.brand_id;
  yr := to_char(now(), 'YYYY');
  prefix := 'PROD-' || brand_slug || '-' || yr || '-';

  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(code, '^' || prefix, ''), '')::int
  ), 0) + 1
  INTO next_seq
  FROM public.production_orders
  WHERE brand_id = NEW.brand_id AND code LIKE prefix || '%';

  NEW.code := prefix || lpad(next_seq::text, 5, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assign_production_code
BEFORE INSERT ON public.production_orders
FOR EACH ROW EXECUTE FUNCTION public.assign_production_code();

-- 5) updated_at + creador
CREATE OR REPLACE FUNCTION public.set_production_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  IF NEW.created_by_email IS NULL THEN
    SELECT email INTO NEW.created_by_email FROM public.profiles WHERE user_id = NEW.created_by LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_set_production_creator
BEFORE INSERT ON public.production_orders
FOR EACH ROW EXECUTE FUNCTION public.set_production_creator();

CREATE TRIGGER trg_production_updated_at
BEFORE UPDATE ON public.production_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) Auditoría de cambios
CREATE OR REPLACE FUNCTION public.log_production_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  uemail text;
BEGIN
  SELECT email INTO uemail FROM public.profiles WHERE user_id = uid LIMIT 1;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.production_audit_log(production_order_id, brand_id, action, new_value, changed_by, changed_by_email)
    VALUES (NEW.id, NEW.brand_id, 'create',
      jsonb_build_object('code', NEW.code, 'status', NEW.status, 'workshop', NEW.workshop, 'priority', NEW.priority),
      uid, uemail);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.production_audit_log(production_order_id, brand_id, action, field, old_value, new_value, changed_by, changed_by_email)
      VALUES (NEW.id, NEW.brand_id, 'status', 'status', to_jsonb(OLD.status), to_jsonb(NEW.status), uid, uemail);
      IF NEW.status = 'listo' AND OLD.status <> 'listo' THEN
        NEW.completed_at := now();
      END IF;
    END IF;
    IF NEW.workshop IS DISTINCT FROM OLD.workshop THEN
      INSERT INTO public.production_audit_log(production_order_id, brand_id, action, field, old_value, new_value, changed_by, changed_by_email)
      VALUES (NEW.id, NEW.brand_id, 'update', 'workshop', to_jsonb(OLD.workshop), to_jsonb(NEW.workshop), uid, uemail);
    END IF;
    IF NEW.assigned_to_label IS DISTINCT FROM OLD.assigned_to_label THEN
      INSERT INTO public.production_audit_log(production_order_id, brand_id, action, field, old_value, new_value, changed_by, changed_by_email)
      VALUES (NEW.id, NEW.brand_id, 'update', 'assigned_to', to_jsonb(OLD.assigned_to_label), to_jsonb(NEW.assigned_to_label), uid, uemail);
    END IF;
    IF NEW.priority IS DISTINCT FROM OLD.priority THEN
      INSERT INTO public.production_audit_log(production_order_id, brand_id, action, field, old_value, new_value, changed_by, changed_by_email)
      VALUES (NEW.id, NEW.brand_id, 'update', 'priority', to_jsonb(OLD.priority), to_jsonb(NEW.priority), uid, uemail);
    END IF;
    IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
      INSERT INTO public.production_audit_log(production_order_id, brand_id, action, field, old_value, new_value, changed_by, changed_by_email)
      VALUES (NEW.id, NEW.brand_id, 'update', 'due_date', to_jsonb(OLD.due_date), to_jsonb(NEW.due_date), uid, uemail);
    END IF;
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      INSERT INTO public.production_audit_log(production_order_id, brand_id, action, field, old_value, new_value, changed_by, changed_by_email)
      VALUES (NEW.id, NEW.brand_id, 'update', 'notes', to_jsonb(OLD.notes), to_jsonb(NEW.notes), uid, uemail);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_log_production_changes
BEFORE INSERT OR UPDATE ON public.production_orders
FOR EACH ROW EXECUTE FUNCTION public.log_production_changes();

-- 7) Auditoría planimetrías
CREATE OR REPLACE FUNCTION public.log_planimetry_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  uemail text;
BEGIN
  SELECT email INTO uemail FROM public.profiles WHERE user_id = uid LIMIT 1;
  IF TG_OP = 'INSERT' THEN
    IF NEW.uploaded_by IS NULL THEN NEW.uploaded_by := uid; END IF;
    IF NEW.uploaded_by_email IS NULL THEN NEW.uploaded_by_email := uemail; END IF;
    INSERT INTO public.production_audit_log(production_order_id, brand_id, action, new_value, changed_by, changed_by_email)
    VALUES (NEW.production_order_id, NEW.brand_id, 'planimetry_upload',
      jsonb_build_object('file_name', NEW.file_name, 'version', NEW.version), uid, uemail);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.production_audit_log(production_order_id, brand_id, action, old_value, changed_by, changed_by_email)
    VALUES (OLD.production_order_id, OLD.brand_id, 'planimetry_delete',
      jsonb_build_object('file_name', OLD.file_name, 'version', OLD.version), uid, uemail);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_log_planimetry_changes
BEFORE INSERT ON public.production_planimetries
FOR EACH ROW EXECUTE FUNCTION public.log_planimetry_changes();
CREATE TRIGGER trg_log_planimetry_delete
AFTER DELETE ON public.production_planimetries
FOR EACH ROW EXECUTE FUNCTION public.log_planimetry_changes();

-- 8) Storage bucket privado para planimetrías
INSERT INTO storage.buckets (id, name, public)
VALUES ('production-planimetries', 'production-planimetries', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Auth read planimetries"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'production-planimetries');
CREATE POLICY "Auth upload planimetries"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'production-planimetries');
CREATE POLICY "Auth delete planimetries"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'production-planimetries');
