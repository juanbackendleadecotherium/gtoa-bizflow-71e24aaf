import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertModuleAllowed(ctx: { supabase: any; userId: string }, module: string) {
  const { data } = await ctx.supabase
    .from("profiles")
    .select("restricted_modules")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  const restricted = (data?.restricted_modules ?? []) as string[];
  if (restricted.includes(module)) {
    throw new Error("No tienes acceso a esta sección.");
  }
}

export const previewWipeCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertModuleAllowed(context, "database");
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
    await assertModuleAllowed(context, "database");
    const { data: result, error } = await context.supabase.rpc(
      "admin_wipe_transactional_data",
      { p_confirm: data.confirm },
    );
    if (error) throw new Error(error.message);
    return { deleted: (result ?? {}) as Record<string, number> };
  });
