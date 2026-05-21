
-- ============================================================
-- Hito 2: customers, orders, items, statuses, history
-- ============================================================

-- helper: ventas con acceso a marca
CREATE OR REPLACE FUNCTION public.can_write_brand(_user_id uuid, _brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR (
      public.has_role(_user_id, 'ventas')
      AND public.has_brand_access(_user_id, _brand_id)
    );
$$;

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  doc_type text,
  doc_number text,
  email text,
  phone text,
  address text,
  city text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX customers_brand_doc_unique
  ON public.customers (brand_id, doc_number)
  WHERE doc_number IS NOT NULL;

CREATE INDEX customers_brand_idx ON public.customers (brand_id);
CREATE INDEX customers_name_idx ON public.customers (brand_id, display_name);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View customers by brand access"
  ON public.customers FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));

CREATE POLICY "Write customers (admin or ventas)"
  ON public.customers FOR INSERT TO authenticated
  WITH CHECK (public.can_write_brand(auth.uid(), brand_id));

CREATE POLICY "Update customers (admin or ventas)"
  ON public.customers FOR UPDATE TO authenticated
  USING (public.can_write_brand(auth.uid(), brand_id));

CREATE POLICY "Delete customers (admin or ventas)"
  ON public.customers FOR DELETE TO authenticated
  USING (public.can_write_brand(auth.uid(), brand_id));

CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- ORDER STATUSES (per brand)
-- ============================================================
CREATE TABLE public.order_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  color text NOT NULL DEFAULT '#64748b',
  sort_order integer NOT NULL DEFAULT 0,
  is_initial boolean NOT NULL DEFAULT false,
  is_final boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, slug)
);

CREATE INDEX order_statuses_brand_idx ON public.order_statuses (brand_id, sort_order);

ALTER TABLE public.order_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View statuses by brand access"
  ON public.order_statuses FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));

CREATE POLICY "Insert statuses (admin or ventas)"
  ON public.order_statuses FOR INSERT TO authenticated
  WITH CHECK (public.can_write_brand(auth.uid(), brand_id));

CREATE POLICY "Update statuses (admin or ventas)"
  ON public.order_statuses FOR UPDATE TO authenticated
  USING (public.can_write_brand(auth.uid(), brand_id));

CREATE POLICY "Delete statuses (admin or ventas)"
  ON public.order_statuses FOR DELETE TO authenticated
  USING (public.can_write_brand(auth.uid(), brand_id));

CREATE TRIGGER order_statuses_set_updated_at
  BEFORE UPDATE ON public.order_statuses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- seed default statuses for every existing brand
INSERT INTO public.order_statuses (brand_id, name, slug, color, sort_order, is_initial, is_final)
SELECT b.id, s.name, s.slug, s.color, s.sort_order, s.is_initial, s.is_final
FROM public.brands b
CROSS JOIN (VALUES
  ('Borrador',       'borrador',       '#94a3b8', 1, true,  false),
  ('Confirmado',     'confirmado',     '#3b82f6', 2, false, false),
  ('En producción',  'en-produccion',  '#f59e0b', 3, false, false),
  ('Entregado',      'entregado',      '#16a34a', 4, false, true),
  ('Cancelado',      'cancelado',      '#ef4444', 5, false, true)
) AS s(name, slug, color, sort_order, is_initial, is_final);

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  order_number text NOT NULL,
  status_id uuid NOT NULL REFERENCES public.order_statuses(id) ON DELETE RESTRICT,
  notes text,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  tax numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  assigned_to uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, order_number)
);

CREATE INDEX orders_brand_idx ON public.orders (brand_id, created_at DESC);
CREATE INDEX orders_status_idx ON public.orders (status_id);
CREATE INDEX orders_customer_idx ON public.orders (customer_id);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View orders by brand access"
  ON public.orders FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));

CREATE POLICY "Insert orders (admin or ventas)"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (public.can_write_brand(auth.uid(), brand_id));

CREATE POLICY "Update orders (admin or ventas)"
  ON public.orders FOR UPDATE TO authenticated
  USING (public.can_write_brand(auth.uid(), brand_id));

CREATE POLICY "Delete orders (admin or ventas)"
  ON public.orders FOR DELETE TO authenticated
  USING (public.can_write_brand(auth.uid(), brand_id));

CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- assign order number: <SLUG>-<YEAR>-<6 digits>
CREATE OR REPLACE FUNCTION public.assign_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  brand_slug text;
  yr text;
  next_seq int;
  prefix text;
BEGIN
  IF NEW.order_number IS NOT NULL AND length(NEW.order_number) > 0 THEN
    RETURN NEW;
  END IF;

  SELECT upper(slug) INTO brand_slug FROM public.brands WHERE id = NEW.brand_id;
  yr := to_char(now(), 'YYYY');
  prefix := brand_slug || '-' || yr || '-';

  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(order_number, '^' || prefix, ''), '')::int
  ), 0) + 1
  INTO next_seq
  FROM public.orders
  WHERE brand_id = NEW.brand_id
    AND order_number LIKE prefix || '%';

  NEW.order_number := prefix || lpad(next_seq::text, 6, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_assign_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_order_number();

-- ============================================================
-- ORDER ITEMS
-- ============================================================
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(14,2) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_items_order_idx ON public.order_items (order_id, sort_order);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View order items via order"
  ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND public.has_brand_access(auth.uid(), o.brand_id)
  ));

CREATE POLICY "Write order items (admin or ventas)"
  ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND public.can_write_brand(auth.uid(), o.brand_id)
  ));

CREATE POLICY "Update order items (admin or ventas)"
  ON public.order_items FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND public.can_write_brand(auth.uid(), o.brand_id)
  ));

CREATE POLICY "Delete order items (admin or ventas)"
  ON public.order_items FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND public.can_write_brand(auth.uid(), o.brand_id)
  ));

CREATE TRIGGER order_items_set_updated_at
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- line_total = quantity * unit_price
CREATE OR REPLACE FUNCTION public.set_line_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.line_total := COALESCE(NEW.quantity, 0) * COALESCE(NEW.unit_price, 0);
  RETURN NEW;
END;
$$;

CREATE TRIGGER order_items_compute_line_total
  BEFORE INSERT OR UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_line_total();

-- recalc order subtotal/total
CREATE OR REPLACE FUNCTION public.recalc_order_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_order uuid;
  new_subtotal numeric(14,2);
BEGIN
  target_order := COALESCE(NEW.order_id, OLD.order_id);

  SELECT COALESCE(SUM(line_total), 0) INTO new_subtotal
  FROM public.order_items WHERE order_id = target_order;

  UPDATE public.orders
    SET subtotal = new_subtotal,
        total = new_subtotal - COALESCE(discount, 0) + COALESCE(tax, 0),
        updated_at = now()
    WHERE id = target_order;

  RETURN NULL;
END;
$$;

CREATE TRIGGER order_items_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_order_totals();

-- ============================================================
-- ORDER STATUS HISTORY
-- ============================================================
CREATE TABLE public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status_id uuid REFERENCES public.order_statuses(id),
  to_status_id uuid NOT NULL REFERENCES public.order_statuses(id),
  changed_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_history_order_idx ON public.order_status_history (order_id, created_at DESC);

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View order history via order"
  ON public.order_status_history FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_status_history.order_id
      AND public.has_brand_access(auth.uid(), o.brand_id)
  ));

-- no insert/update/delete policies → only triggers (SECURITY DEFINER) write

-- log status changes
CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_status_history (order_id, from_status_id, to_status_id, changed_by, note)
    VALUES (NEW.id, NULL, NEW.status_id, NEW.created_by, 'Pedido creado');
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.status_id IS DISTINCT FROM OLD.status_id THEN
    INSERT INTO public.order_status_history (order_id, from_status_id, to_status_id, changed_by)
    VALUES (NEW.id, OLD.status_id, NEW.status_id, auth.uid());
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_log_status_change
  AFTER INSERT OR UPDATE OF status_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_status_change();
