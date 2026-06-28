import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertLogisticsRole(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin === true) return "admin";
  const { data: isLog } = await supabase.rpc("has_role", { _user_id: userId, _role: "logistica" });
  if (isLog === true) return "logistica";
  throw new Error("No autorizado: requiere rol logística o admin");
}

export const listDrivers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("drivers")
      .select("id, full_name, phone, vehicle_label, vehicle_type, availability, notes, active, updated_at")
      .order("active", { ascending: false })
      .order("full_name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

const UpsertDriverInput = z.object({
  id: z.string().uuid().optional(),
  fullName: z.string().min(2, "Nombre obligatorio"),
  phone: z.string().optional().nullable(),
  vehicleLabel: z.string().optional().nullable(),
  vehicleType: z.enum(["propio", "externo"]),
  availability: z.enum(["disponible", "en_ruta", "no_disponible"]).optional(),
  notes: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

export const upsertDriver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertDriverInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertLogisticsRole(context.supabase, context.userId);
    const payload = {
      full_name: data.fullName.trim(),
      phone: data.phone?.trim() || null,
      vehicle_label: data.vehicleLabel?.trim() || null,
      vehicle_type: data.vehicleType,
      availability: data.availability ?? "disponible",
      notes: data.notes?.trim() || null,
      active: data.active ?? true,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("drivers").update(payload).eq("id", data.id).select().single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("drivers").insert(payload).select().single();
    if (error) throw error;
    return row;
  });

export const setDriverAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      availability: z.enum(["disponible", "en_ruta", "no_disponible"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertLogisticsRole(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("drivers").update({ availability: data.availability }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deactivateDriver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertLogisticsRole(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("drivers").update({ active: data.active }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
