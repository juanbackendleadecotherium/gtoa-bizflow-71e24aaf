ALTER TABLE public.order_item_supplier_payments
  ALTER COLUMN receipt_path DROP NOT NULL,
  ALTER COLUMN receipt_mime DROP NOT NULL,
  ALTER COLUMN receipt_size_bytes DROP NOT NULL;