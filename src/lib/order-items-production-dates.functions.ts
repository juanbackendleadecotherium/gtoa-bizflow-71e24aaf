import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Registra o edita el INICIO de producción de un ítem con fecha específica.
 * - Si el ítem aún no tenía inicio, llama a start_real_production (dispara notificación al vendedor y cálculo de fecha esperada).
 * - Si ya tenía inicio, actualiza la fecha vía update_order_item_started_at.
 */
export const setItemProductionStart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        itemId: z.string().uuid(),
        startedAt: z.string().min(1), // ISO date (YYYY-MM-DD) o timestamptz
        alreadyStarted: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Normalizar a timestamptz a mediodía local si viene solo la fecha
    const iso =
      data.startedAt.length === 10
        ? new Date(data.startedAt + "T12:00:00").toISOString()
        : new Date(data.startedAt).toISOString();

    if (data.alreadyStarted) {
      const { error } = await context.supabase.rpc("update_order_item_started_at", {
        _item_id: data.itemId,
        _started_at: iso,
      });
      if (error) throw error;
    } else {
      const { error } = await context.supabase.rpc("start_real_production", {
        p_item_id: data.itemId,
        p_started_at: iso,
      });
      if (error) throw error;
    }
    return { ok: true };
  });

/**
 * Registra o edita el TERMINADO de un ítem con fecha específica.
 * - Si no estaba terminado, llama a mark_order_item_finished con la fecha (dispara notificación al vendedor y tarea de cobro cuando todos terminan).
 * - Si ya estaba terminado, actualiza la fecha vía update_order_item_finished_at.
 */
export const setItemProductionFinish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        itemId: z.string().uuid(),
        finishedAt: z.string().min(1),
        alreadyFinished: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const iso =
      data.finishedAt.length === 10
        ? new Date(data.finishedAt + "T12:00:00").toISOString()
        : new Date(data.finishedAt).toISOString();

    if (data.alreadyFinished) {
      const { error } = await context.supabase.rpc("update_order_item_finished_at", {
        _item_id: data.itemId,
        _finished_at: iso,
      });
      if (error) throw error;
    } else {
      const { error } = await context.supabase.rpc("mark_order_item_finished", {
        _item_id: data.itemId,
        _finished_at: iso,
      });
      if (error) throw error;
    }
    return { ok: true };
  });
