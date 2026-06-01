import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Stub para envío de factura por correo.
 *
 * Pendiente de configurar:
 *   - Dominio propio + registros DNS verificados
 *   - Cuenta Resend (https://resend.com) + API key como secreto RESEND_API_KEY
 *
 * Una vez configurado, este handler:
 *   1. Descarga el PDF desde el bucket `invoices` (admin client).
 *   2. Renderiza la plantilla HTML en src/lib/email-templates/invoice-html.ts
 *   3. Llama a Resend con el adjunto + HTML.
 *   4. Actualiza la fila `invoices` con sent_at / sent_to / send_count++.
 */
export const sendInvoiceEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      invoice_id: z.string().uuid(),
      to: z.string().email(),
    }).parse(input),
  )
  .handler(async () => {
    const hasKey = !!process.env.RESEND_API_KEY;
    if (!hasKey) {
      return {
        status: "not_configured" as const,
        message: "Configura RESEND_API_KEY y un dominio verificado para habilitar el envío.",
      };
    }
    // TODO: implementar envío real cuando esté el dominio + API key.
    return { status: "not_implemented" as const };
  });
