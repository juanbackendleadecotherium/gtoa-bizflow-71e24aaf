import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const InputSchema = z.object({
  text: z.string().min(10, "Pega la conversación de WhatsApp").max(20000),
});

const ExtractedSchema = z.object({
  customer: z.object({
    display_name: z.string().describe("Nombre del cliente"),
    phone: z.string().describe("Teléfono normalizado, sólo dígitos con código país si aparece"),
    address: z.string().describe("Dirección completa si se menciona, vacío si no"),
    city: z.string().describe("Ciudad si se menciona, vacío si no"),
  }),
  items: z
    .array(
      z.object({
        description: z.string().describe("Descripción del producto solicitado"),
        quantity: z.number().describe("Cantidad solicitada, 1 si no se especifica"),
        unit_price: z.number().describe("Valor unitario en pesos colombianos, 0 si no aparece"),
      }),
    )
    .describe("Productos solicitados"),
  notes: z.string().describe("Observaciones, fechas, condiciones especiales mencionadas"),
  total_estimated: z.number().describe("Valor total acordado si aparece, 0 si no"),
});

export const parseWhatsAppOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY no configurada");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-2.5-flash");

    const { output } = await generateText({
      model,
      output: Output.object({ schema: ExtractedSchema }),
      system:
        "Eres un asistente que extrae información estructurada de conversaciones de WhatsApp en español (Colombia) " +
        "para crear pedidos en un ERP de muebles a la medida. Devuelve campos vacíos ('' o 0) si un dato no aparece, " +
        "nunca inventes. Los precios están en pesos colombianos sin decimales. Normaliza teléfonos a sólo dígitos.",
      prompt: `Extrae los datos del pedido de esta conversación:\n\n${data.text}`,
    });

    return output;
  });
