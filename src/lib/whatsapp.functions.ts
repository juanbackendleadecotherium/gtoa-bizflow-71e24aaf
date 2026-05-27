import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const InputSchema = z.object({
  text: z.string().min(10, "Pega la conversación de WhatsApp").max(20000),
});

const ExtractedSchema = z.object({
  customer: z.object({
    display_name: z.string().catch(""),
    phone: z.string().catch(""),
    email: z.string().catch(""),
    doc_number: z.string().catch(""),
    address: z.string().catch(""),
    city: z.string().catch(""),
    needs_summary: z.string().catch(""),
    references: z.string().catch(""),
  }),
  items: z
    .array(
      z.object({
        description: z.string().catch(""),
        quantity: z.coerce.number().catch(1),
        unit_price: z.coerce.number().catch(0),
      }),
    )
    .catch([]),
  notes: z.string().catch(""),
  urgency: z.string().catch(""),
  estimated_delivery_date: z.string().catch(""),
  total_estimated: z.coerce.number().catch(0),
});

type ExtractedOrder = z.infer<typeof ExtractedSchema>;
function normalizeExtractedOrder(order: ExtractedOrder): ExtractedOrder {
  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(order.estimated_delivery_date.trim())
    ? order.estimated_delivery_date.trim()
    : "";
  const email = order.customer.email.trim().toLowerCase();
  return {
    customer: {
      display_name: order.customer.display_name.trim(),
      phone: order.customer.phone.replace(/\D/g, ""),
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
      doc_number: order.customer.doc_number.replace(/\D/g, ""),
      address: order.customer.address.trim(),
      city: order.customer.city.trim(),
      needs_summary: order.customer.needs_summary.trim(),
      references: order.customer.references.trim(),
    },
    items: order.items.map((item) => ({
      description: item.description.trim(),
      quantity: Math.max(1, Number.isFinite(item.quantity) ? item.quantity : 1),
      unit_price: Math.max(0, Math.round(Number.isFinite(item.unit_price) ? item.unit_price : 0)),
    })),
    notes: order.notes.trim(),
    urgency: order.urgency.trim(),
    estimated_delivery_date: isoDate,
    total_estimated: Math.max(
      0,
      Math.round(Number.isFinite(order.total_estimated) ? order.total_estimated : 0),
    ),
  };
}

export const parseWhatsAppOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return {
        success: false,
        message: "La IA no está configurada todavía. Revisa LOVABLE_API_KEY en el proyecto.",
      };
    }

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    try {
      const { text } = await generateText({
        model,
        temperature: 0,
        maxOutputTokens: 1800,
        system:
          "Extrae pedidos de WhatsApp en español de Colombia para un ERP de muebles a la medida. " +
          "Responde únicamente un objeto JSON válido, sin markdown, sin comentarios y sin texto adicional. " +
          "No inventes datos. Usa cadenas vacías o 0 cuando un dato no aparezca. " +
          "Los teléfonos deben contener sólo dígitos. Los precios deben ser números enteros en pesos colombianos, sin puntos, comas ni símbolos.",
        prompt:
          "Devuelve exactamente esta estructura: " +
          '{"customer":{"display_name":"","phone":"","address":"","city":""},"items":[{"description":"","quantity":1,"unit_price":0}],"notes":"","total_estimated":0}' +
          `\n\nConversación:\n${data.text}`,
      });

      const parsed = ExtractedSchema.parse(extractJsonObject(text));
      return { success: true, order: normalizeExtractedOrder(parsed) };
    } catch (error) {
      console.error("[WhatsApp AI] Extraction failed", error);
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "No se pudo procesar el texto de WhatsApp. Intenta con un resumen más claro del pedido.",
      };
    }
  });
