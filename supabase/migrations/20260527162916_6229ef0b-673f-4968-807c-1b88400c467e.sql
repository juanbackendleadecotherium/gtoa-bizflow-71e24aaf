
-- Add 'vendedor' role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendedor';

-- Orders: campos para captura WhatsApp + vendedor + entrega estimada
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS seller_id uuid,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS whatsapp_raw text,
  ADD COLUMN IF NOT EXISTS estimated_delivery_date date;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_source_check
  CHECK (source IN ('whatsapp','manual','comercial'));

CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON public.orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_source ON public.orders(source);

-- Customers: índice por teléfono para búsqueda rápida desde captura IA
CREATE INDEX IF NOT EXISTS idx_customers_brand_phone ON public.customers(brand_id, phone);
