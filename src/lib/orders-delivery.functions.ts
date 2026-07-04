import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DeferralRow = {
  id: string;
  order_id: string;
  previous_date: string | null;
  new_date: string;
  reason: string;
  created_by: string | null;
  created_by_email: string | null;
  created_at: string;
};

const DeferInput = z.object({
  orderId: z.string().uuid(),
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(5),
});

export const deferOrderDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeferInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("defer_order_delivery", {
      p_order_id: data.orderId,
      p_new_date: data.newDate,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ListInput = z.object({ orderId: z.string().uuid() });

export const listOrderDeferrals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("order_delivery_deferrals")
      .select("id, order_id, previous_date, new_date, reason, created_by, created_by_email, created_at")
      .eq("order_id", data.orderId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as DeferralRow[];
  });
