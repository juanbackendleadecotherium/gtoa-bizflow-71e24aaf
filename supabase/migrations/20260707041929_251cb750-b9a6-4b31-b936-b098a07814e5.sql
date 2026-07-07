
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paulatino_authorized_by uuid,
  ADD COLUMN IF NOT EXISTS paulatino_authorized_by_email text,
  ADD COLUMN IF NOT EXISTS paulatino_authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS paulatino_advance_at_send numeric;

-- Autorización al crear
CREATE OR REPLACE FUNCTION public.sync_paulatino_authorization()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text;
BEGIN
  IF NEW.sale_type = 'pago_paulatino' AND NEW.paulatino_authorized_at IS NULL THEN
    IF NEW.seller_id IS NOT NULL THEN
      SELECT email INTO v_email FROM public.profiles WHERE id = NEW.seller_id;
    END IF;
    NEW.paulatino_authorized_by := COALESCE(NEW.paulatino_authorized_by, NEW.seller_id);
    NEW.paulatino_authorized_by_email := COALESCE(NEW.paulatino_authorized_by_email, v_email);
    NEW.paulatino_authorized_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_paulatino_authorization ON public.orders;
CREATE TRIGGER trg_sync_paulatino_authorization
BEFORE INSERT OR UPDATE OF sale_type ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_paulatino_authorization();

-- Snapshot del anticipo al enviar el primer producto a producción
CREATE OR REPLACE FUNCTION public.snapshot_paulatino_advance_on_send()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sale_type text;
  v_already numeric;
  v_advance numeric;
BEGIN
  IF NEW.production_order_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.production_order_id IS NOT NULL THEN RETURN NEW; END IF;

  SELECT sale_type, paulatino_advance_at_send, COALESCE(advance_amount, 0)
    INTO v_sale_type, v_already, v_advance
    FROM public.orders WHERE id = NEW.order_id;

  IF v_sale_type = 'pago_paulatino' AND v_already IS NULL THEN
    UPDATE public.orders
       SET paulatino_advance_at_send = v_advance
     WHERE id = NEW.order_id;

    -- Bitácora (best-effort; ignora si la tabla no tiene columnas esperadas)
    BEGIN
      INSERT INTO public.order_audit_log (order_id, action, detail)
      VALUES (
        NEW.order_id,
        'paulatino_send_to_production',
        jsonb_build_object('advance_at_send', v_advance)
      );
    EXCEPTION WHEN undefined_column OR undefined_table THEN NULL;
    END;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_snapshot_paulatino_advance ON public.order_items;
CREATE TRIGGER trg_snapshot_paulatino_advance
AFTER INSERT OR UPDATE OF production_order_id ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.snapshot_paulatino_advance_on_send();
