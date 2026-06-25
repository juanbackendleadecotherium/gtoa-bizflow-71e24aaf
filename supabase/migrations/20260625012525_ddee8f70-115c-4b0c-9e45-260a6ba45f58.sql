-- warehouse_settings: singleton config table for stagnant-days threshold
CREATE TABLE public.warehouse_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  stagnant_days_threshold integer NOT NULL DEFAULT 15 CHECK (stagnant_days_threshold > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT warehouse_settings_singleton_chk CHECK (singleton = true)
);

GRANT SELECT ON public.warehouse_settings TO authenticated;
GRANT ALL ON public.warehouse_settings TO service_role;

ALTER TABLE public.warehouse_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warehouse_settings_select_authenticated"
  ON public.warehouse_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "warehouse_settings_update_admin"
  ON public.warehouse_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "warehouse_settings_insert_admin"
  ON public.warehouse_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER warehouse_settings_updated_at
  BEFORE UPDATE ON public.warehouse_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed singleton row
INSERT INTO public.warehouse_settings (singleton, stagnant_days_threshold)
VALUES (true, 15)
ON CONFLICT (singleton) DO NOTHING;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.warehouse_settings;
