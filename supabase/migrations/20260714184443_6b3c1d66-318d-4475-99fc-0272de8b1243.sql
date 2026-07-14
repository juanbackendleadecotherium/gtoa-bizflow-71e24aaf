ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_proof_urls text[] NOT NULL DEFAULT '{}';

-- Backfill: any legacy single URL becomes the first (and only) item of the array.
UPDATE public.orders
SET payment_proof_urls = ARRAY[payment_proof_url]
WHERE payment_proof_url IS NOT NULL
  AND (payment_proof_urls IS NULL OR array_length(payment_proof_urls, 1) IS NULL);