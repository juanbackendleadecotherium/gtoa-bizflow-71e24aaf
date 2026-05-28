
-- Storage bucket for order attachments (payment proofs + product references)
INSERT INTO storage.buckets (id, name, public)
VALUES ('order-attachments', 'order-attachments', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Anyone can read (bucket is public; URLs use unguessable uuids)
CREATE POLICY "order-attachments public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'order-attachments');

-- Only authenticated users can upload / update / delete
CREATE POLICY "order-attachments auth insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'order-attachments');

CREATE POLICY "order-attachments auth update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'order-attachments');

CREATE POLICY "order-attachments auth delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'order-attachments');

-- Columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_proof_url text;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;
