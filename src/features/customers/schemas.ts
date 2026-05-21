import { z } from "zod";

export const customerSchema = z.object({
  display_name: z.string().min(1, "Requerido").max(200),
  doc_type: z.string().max(20).optional().or(z.literal("")),
  doc_number: z.string().max(50).optional().or(z.literal("")),
  email: z.string().email("Email inválido").max(200).optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  address: z.string().max(300).optional().or(z.literal("")),
  city: z.string().max(120).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  is_active: z.boolean().default(true),
});

export type CustomerInput = z.infer<typeof customerSchema>;
