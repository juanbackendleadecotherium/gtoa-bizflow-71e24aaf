import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const markOrderItemFinished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ itemId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("mark_order_item_finished", { _item_id: data.itemId });
    if (error) throw error;
    return { ok: true };
  });

export const unmarkOrderItemFinished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ itemId: z.string().uuid(), reason: z.string().min(10) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("unmark_order_item_finished", {
      _item_id: data.itemId,
      _reason: data.reason,
    });
    if (error) throw error;
    return { ok: true };
  });

export const getOrderCompletionProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("order_completion_progress", {
      _order_id: data.orderId,
    });
    if (error) throw error;
    const row = Array.isArray(rows) ? rows[0] : rows;
    return (row ?? { total: 0, finished: 0, all_finished: false }) as {
      total: number;
      finished: number;
      all_finished: boolean;
    };
  });
