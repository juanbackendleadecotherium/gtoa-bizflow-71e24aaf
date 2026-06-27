import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CONFIRM_PHRASE = "LIMPIAR BASE DE DATOS";

// Order matters — children before parents. supabaseAdmin bypasses RLS.
const WIPE_TABLES = [
  "order_audit_log",
  "order_status_history",
  "order_collection_followups",
  "order_payments",
  "order_item_supplier_payments",
  "invoice_versions",
  "invoices",
  "production_planimetries",
  "production_audit_log",
  "real_production_audit_log",
  "seller_tasks",
  "warehouse_movements",
  "order_items",
  "production_orders",
  "real_production_orders",
  "order_deletions",
  "production_deletions",
  "orders",
  "customers",
] as const;

export const previewWipeCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Solo administradores.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const counts: Record<string, number> = {};
    for (const t of WIPE_TABLES) {
      const { count, error } = await supabaseAdmin
        .from(t)
        .select("*", { count: "exact", head: true });
      if (error) throw new Error(`${t}: ${error.message}`);
      counts[t] = count ?? 0;
    }
    return counts;
  });

export const wipeTransactionalData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { confirm: string }) =>
    z.object({ confirm: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.confirm !== CONFIRM_PHRASE) {
      throw new Error(`Debes escribir exactamente: ${CONFIRM_PHRASE}`);
    }
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Solo administradores pueden ejecutar esta acción.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const deleted: Record<string, number> = {};
    for (const t of WIPE_TABLES) {
      const { error, count } = await supabaseAdmin
        .from(t)
        .delete({ count: "exact" })
        .not("id", "is", null);
      if (error) throw new Error(`${t}: ${error.message}`);
      deleted[t] = count ?? 0;
    }

    // Audit
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("email").eq("user_id", context.userId).maybeSingle();
    await supabaseAdmin.from("user_admin_audit").insert({
      actor_user_id: context.userId,
      actor_email: profile?.email ?? null,
      target_user_id: null,
      target_email: null,
      action: "wipe_transactional_data",
      details: { deleted },
    });

    return { deleted };
  });
