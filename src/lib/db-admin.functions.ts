import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const previewWipeCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_preview_wipe_counts");
    if (error) throw new Error(error.message);
    return (data ?? {}) as Record<string, number>;
  });

export const wipeTransactionalData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { confirm: string }) =>
    z.object({ confirm: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc(
      "admin_wipe_transactional_data",
      { p_confirm: data.confirm },
    );
    if (error) throw new Error(error.message);
    return { deleted: (result ?? {}) as Record<string, number> };
  });
