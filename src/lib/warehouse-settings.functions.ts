import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getWarehouseSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("warehouse_settings")
      .select("id, stagnant_days_threshold, updated_at")
      .eq("singleton", true)
      .maybeSingle();
    if (error) throw error;
    return data ?? { id: null, stagnant_days_threshold: 15, updated_at: null };
  });

export const updateStagnantThreshold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ days: z.number().int().min(1).max(365) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Solo administradores pueden cambiar el umbral");
    const { data: row, error } = await context.supabase
      .from("warehouse_settings")
      .update({ stagnant_days_threshold: data.days, updated_by: context.userId })
      .eq("singleton", true)
      .select()
      .single();
    if (error) throw error;
    return row;
  });
