-- Add deadline column for upload_planimetry seller tasks
ALTER TABLE public.seller_tasks
  ADD COLUMN IF NOT EXISTS planimetry_due_at timestamptz;

-- Function: add N business days (Mon-Fri) to a timestamp
CREATE OR REPLACE FUNCTION public.add_business_days(_from timestamptz, _n int)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d timestamptz := _from;
  added int := 0;
BEGIN
  WHILE added < _n LOOP
    d := d + interval '1 day';
    -- 1=Mon ... 7=Sun in ISO; skip Sat (6) and Sun (7)
    IF EXTRACT(ISODOW FROM d) < 6 THEN
      added := added + 1;
    END IF;
  END LOOP;
  RETURN d;
END
$$;

-- Trigger to set the due date when an upload_planimetry task is inserted
CREATE OR REPLACE FUNCTION public.set_planimetry_due_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'upload_planimetry' AND NEW.planimetry_due_at IS NULL THEN
    NEW.planimetry_due_at := public.add_business_days(now(), 2);
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_set_planimetry_due_at ON public.seller_tasks;
CREATE TRIGGER trg_set_planimetry_due_at
BEFORE INSERT ON public.seller_tasks
FOR EACH ROW
EXECUTE FUNCTION public.set_planimetry_due_at();

-- Backfill: existing pending upload_planimetry tasks → due 2 business days after their created_at
UPDATE public.seller_tasks
   SET planimetry_due_at = public.add_business_days(created_at, 2)
 WHERE type = 'upload_planimetry'
   AND status = 'pendiente'
   AND planimetry_due_at IS NULL;

-- Allow admins (gerente de ventas) to read all seller_tasks
DROP POLICY IF EXISTS "Admins can view all seller tasks" ON public.seller_tasks;
CREATE POLICY "Admins can view all seller tasks"
  ON public.seller_tasks
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));