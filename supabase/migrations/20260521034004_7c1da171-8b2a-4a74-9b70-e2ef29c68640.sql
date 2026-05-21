
-- =========================
-- ENUM: app_role
-- =========================
CREATE TYPE public.app_role AS ENUM ('admin', 'operativo', 'finanzas', 'ventas');

-- =========================
-- Utility: updated_at trigger fn
-- =========================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================
-- TABLE: brands
-- =========================
CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  legal_name text,
  tax_id text,
  primary_color text NOT NULL DEFAULT '#0f172a',
  logo_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_brands_updated_at
BEFORE UPDATE ON public.brands
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed brands
INSERT INTO public.brands (slug, name, legal_name, primary_color) VALUES
  ('espacio-inmobiliario', 'Espacio Inmobiliario', 'Espacio Inmobiliario S.A.S.', '#1e3a5f'),
  ('montenegro-design',  'Montenegro Design',  'Montenegro Design S.A.S.',  '#7c3aed'),
  ('casa-diseno',        'Casa Diseño',        'Casa Diseño S.A.S.',        '#b45309'),
  ('gtoa',               'GTOA',               'Grupo GTOA S.A.S.',         '#0f766e');

-- =========================
-- TABLE: profiles
-- =========================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- TABLE: user_roles  (SEPARATE from profiles to prevent privilege escalation)
-- =========================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =========================
-- SECURITY DEFINER: has_role
-- =========================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- =========================
-- TABLE: user_brands  (which brands a user can access)
-- =========================
CREATE TABLE public.user_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, brand_id)
);

ALTER TABLE public.user_brands ENABLE ROW LEVEL SECURITY;

-- =========================
-- SECURITY DEFINER: has_brand_access (admins always pass)
-- =========================
CREATE OR REPLACE FUNCTION public.has_brand_access(_user_id uuid, _brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_brands
      WHERE user_id = _user_id AND brand_id = _brand_id
    );
$$;

-- =========================
-- RLS POLICIES
-- =========================

-- brands: any authenticated user can read active brands; only admins can write
CREATE POLICY "Authenticated can view brands"
  ON public.brands FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert brands"
  ON public.brands FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update brands"
  ON public.brands FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete brands"
  ON public.brands FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- profiles: own row read/update; admins can read all
CREATE POLICY "Users view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- user_roles: user reads own roles; only admins write
CREATE POLICY "Users view own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles insert"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles update"
  ON public.user_roles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles delete"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- user_brands: user reads own brand assignments; only admins write
CREATE POLICY "Users view own brand access"
  ON public.user_brands FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins assign brand access"
  ON public.user_brands FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update brand access"
  ON public.user_brands FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins remove brand access"
  ON public.user_brands FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =========================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =========================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
