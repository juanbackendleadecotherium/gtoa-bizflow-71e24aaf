CREATE TABLE public.user_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  actor_email text,
  target_user_id uuid,
  target_email text,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.user_admin_audit TO authenticated;
GRANT ALL ON public.user_admin_audit TO service_role;

ALTER TABLE public.user_admin_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read user admin audit"
  ON public.user_admin_audit FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert user admin audit"
  ON public.user_admin_audit FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_user_admin_audit_created_at ON public.user_admin_audit(created_at DESC);
CREATE INDEX idx_user_admin_audit_target ON public.user_admin_audit(target_user_id);