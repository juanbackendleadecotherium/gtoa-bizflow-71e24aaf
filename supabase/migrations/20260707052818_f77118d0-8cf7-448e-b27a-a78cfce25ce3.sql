
ALTER TABLE public.order_payments
  ADD COLUMN IF NOT EXISTS proof_urls text[] NOT NULL DEFAULT '{}';

-- Backfill: mover proof_url existente a proof_urls
UPDATE public.order_payments
SET proof_urls = ARRAY[proof_url]
WHERE proof_url IS NOT NULL
  AND (proof_urls IS NULL OR array_length(proof_urls, 1) IS NULL);
