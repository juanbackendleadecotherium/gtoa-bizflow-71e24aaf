import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const InputSchema = z.object({
  text: z.string().min(10, "Pega la conversación de WhatsApp").max(20000),
});

const DOC_TYPES = ["CC", "CE", "NIT", "TI", "PA", "PEP", "RC", "NIUP"] as const;
const PERSON_TYPES = ["natural", "juridica"] as const;
const CONTACT_TYPES = ["cliente", "proveedor"] as const;
const PAYMENT_METHODS = [
  "efectivo",
  "transferencia",
  "tarjeta",
  "nequi",
  "daviplata",
  "credito",
  "cheque",
  "otro",
] as const;

const ExtractedSchema = z.object({
  customer: z.object({
    display_name: z.string().catch(""),
    company: z.string().catch(""),
    person_type: z.string().catch(""),
    contact_type: z.string().catch(""),
    doc_type: z.string().catch(""),
    doc_number: z.string().catch(""),
    phone: z.string().catch(""),
    email: z.string().catch(""),
    department: z.string().catch(""),
    city: z.string().catch(""),
    address: z.string().catch(""),
    needs_summary: z.string().catch(""),
    references: z.string().catch(""),
  }),
  order: z.object({
    invoice_number: z.string().catch(""),
    sale_date: z.string().catch(""),
    estimated_delivery_date: z.string().catch(""),
    payment_method: z.string().catch(""),
    advance_amount: z.coerce.number().catch(0),
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
});

type ExtractedOrder = z.infer<typeof ExtractedSchema>;

function extractJsonObject(response: string) {
  const cleaned = response
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .replace(/\p{Cc}/gu, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      "La IA no devolvió datos estructurados. Intenta pegar un resumen más claro del pedido.",
    );
  }

  const json = cleaned
    .slice(start, end + 1)
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]");

  try {
    return JSON.parse(json);
  } catch {
    throw new Error(
      "La respuesta de IA llegó incompleta. Intenta con una conversación más corta o más resumida.",
    );
  }
}

function pickEnum<T extends readonly string[]>(value: string, options: T): "" | T[number] {
  const v = value.trim().toLowerCase();
  if (!v) return "";
  const hit = options.find((o) => o.toLowerCase() === v);
  return (hit as T[number]) ?? "";
}

function isoDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : "";
}

function normalizeExtractedOrder(order: ExtractedOrder): ExtractedOrder {
  const email = order.customer.email.trim().toLowerCase();
  return {
    customer: {
      display_name: order.customer.display_name.trim(),
      company: order.customer.company.trim(),
      person_type: pickEnum(order.customer.person_type, PERSON_TYPES),
      contact_type: pickEnum(order.customer.contact_type, CONTACT_TYPES) || "cliente",
      doc_type: pickEnum(order.customer.doc_type.toUpperCase(), DOC_TYPES),
      doc_number: order.customer.doc_number.replace(/\D/g, ""),
      phone: order.customer.phone.replace(/\D/g, ""),
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
      department: order.customer.department.trim(),
      city: order.customer.city.trim(),
      address: order.customer.address.trim(),
      needs_summary: order.customer.needs_summary.trim(),
      references: order.customer.references.trim(),
    },
    order: {
      invoice_number: order.order.invoice_number.trim(),
      sale_date: isoDate(order.order.sale_date),
      estimated_delivery_date: isoDate(order.order.estimated_delivery_date),
      payment_method: pickEnum(order.order.payment_method, PAYMENT_METHODS),
      advance_amount: Math.max(
        0,
        Math.round(Number.isFinite(order.order.advance_amount) ? order.order.advance_amount : 0),
      ),
    },
    items: order.items.map((item) => ({
      description: item.description.trim(),
      quantity: Math.max(1, Number.isFinite(item.quantity) ? item.quantity : 1),
      unit_price: Math.max(0, Math.round(Number.isFinite(item.unit_price) ? item.unit_price : 0)),
    })),
    notes: order.notes.trim(),
    urgency: order.urgency.trim(),
  };
}

export const parseWhatsAppOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return {
        success: false as const,
        message: "La IA no está configurada todavía. Revisa LOVABLE_API_KEY en el proyecto.",
      };
    }

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    try {
      const { text } = await generateText({
        model,
        temperature: 0,
        maxOutputTokens: 4000,
        system:
          "Extrae pedidos de WhatsApp en español de Colombia para un ERP de muebles a la medida. " +
          "Responde únicamente un objeto JSON válido, sin markdown, sin comentarios y sin texto adicional. " +
          "No inventes datos. Usa cadenas vacías o 0 cuando un dato no aparezca. " +
          "person_type: 'natural' si es persona natural, 'juridica' si es empresa/razón social. Vacío si no se sabe. " +
          "contact_type: 'cliente' por defecto, 'proveedor' solo si claramente lo es. " +
          "doc_type: una de CC, CE, NIT, TI, PA, PEP, RC, NIUP (en mayúsculas). " +
          "Teléfonos y documentos: sólo dígitos colombianos. " +
          "department y city: nombres en español sin abreviar. " +
          "payment_method: una de efectivo, transferencia, tarjeta, nequi, daviplata, credito, cheque, otro. " +
          "advance_amount, unit_price: enteros en pesos COP, sin separadores ni símbolos. " +
          "sale_date y estimated_delivery_date en formato YYYY-MM-DD si se mencionan. " +
          "invoice_number: si el vendedor menciona un número de cuenta de cobro/remisión, cópialo tal cual. " +
          "needs_summary: una frase breve (máx 200 caracteres) que explique qué necesita el cliente. " +
          "references: medidas, materiales, colores, acabados o enlaces que mencione el cliente. " +
          "urgency: si menciona urgencia o fechas clave, resume en una frase.\n\n" +
          "REGLAS CRÍTICAS para items[].description (se imprime en la planimetría de producción):\n" +
          "- Debe tener DOS partes separadas por una línea en blanco (use el carácter \\n, doble salto entre título y cuerpo):\n" +
          "  1) PRIMERA LÍNEA = TÍTULO corto y claro del producto (ej: 'Comedor para 6 puestos', 'Mueble para TV', 'Closet modular', 'Mesa auxiliar redonda'). Solo el nombre, sin medidas ni materiales.\n" +
          "  2) CUERPO = especificaciones detalladas, UNA POR LÍNEA, con etiqueta en MAYÚSCULAS seguida de dos puntos. Incluye TODO lo que mencione el cliente: medidas (largo x ancho x alto o diámetro), material, acabado, color, tela, herrajes, compartimentos, número de puestos/puertas, estructura, etc.\n" +
          "- Ejemplo del cuerpo:\n" +
          "  MEDIDAS: 1.80 x 0.90 m\n" +
          "  MATERIAL: madera cedro\n" +
          "  ACABADO: mate\n" +
          "  INCLUYE: 6 sillas tapizadas en tela gris\n" +
          "- NO resumas ni omitas detalles presentes en el texto. Cada medida, color, material o acabado mencionado debe aparecer en la descripción.\n" +
          "- Si un producto no trae detalles, deja solo el título sin cuerpo.",
        prompt:
          "Devuelve EXACTAMENTE esta estructura JSON (los \\n dentro de description son literales): " +
          '{"customer":{"display_name":"","company":"","person_type":"","contact_type":"cliente","doc_type":"","doc_number":"","phone":"","email":"","department":"","city":"","address":"","needs_summary":"","references":""},' +
          '"order":{"invoice_number":"","sale_date":"","estimated_delivery_date":"","payment_method":"","advance_amount":0},' +
          '"items":[{"description":"Título del producto\\n\\nMEDIDAS: ...\\nMATERIAL: ...\\nACABADO: ...","quantity":1,"unit_price":0}],' +
          '"notes":"","urgency":""}' +
          `\n\nConversación:\n${data.text}`,
      });

      const parsed = ExtractedSchema.parse(extractJsonObject(text));
      return { success: true as const, order: normalizeExtractedOrder(parsed) };
    } catch (error) {
      console.error("[WhatsApp AI] Extraction failed", error);
      return {
        success: false as const,
        message:
          error instanceof Error
            ? error.message
            : "No se pudo procesar el texto de WhatsApp. Intenta con un resumen más claro del pedido.",
      };
    }
  });
