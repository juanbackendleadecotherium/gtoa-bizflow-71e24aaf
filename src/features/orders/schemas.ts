import { z } from "zod";

export const orderItemSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1, "Requerido").max(300),
  quantity: z.coerce.number().min(0.01, "Cantidad > 0"),
  unit_price: z.coerce.number().min(0, ">= 0"),
  sort_order: z.number().default(0),
});

export const orderSchema = z.object({
  customer_id: z.string().uuid("Selecciona un cliente"),
  status_id: z.string().uuid().optional(),
  notes: z.string().max(2000).optional().or(z.literal("")),
  discount: z.coerce.number().min(0).default(0),
  tax: z.coerce.number().min(0).default(0),
  items: z.array(orderItemSchema).min(1, "Agrega al menos un producto"),
});

export type OrderItemInput = z.infer<typeof orderItemSchema>;
export type OrderInput = z.infer<typeof orderSchema>;

export const statusSchema = z.object({
  name: z.string().min(1).max(60),
  slug: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/, "minúsculas, números o guiones"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hex #rrggbb"),
  is_initial: z.boolean().default(false),
  is_final: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

export type StatusInput = z.infer<typeof statusSchema>;
