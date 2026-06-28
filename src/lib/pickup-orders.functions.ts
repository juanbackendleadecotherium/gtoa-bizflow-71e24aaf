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

const ListPickupsInput = z.object({
  statuses: z.array(z.enum(["pendiente", "asignada", "en_camino", "recogida", "entregada", "cancelada"])).optional(),
  brandId: z.string().uuid().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
}).default({});

export const listPickupOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListPickupsInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("pickup_orders")
      .select(`id, order_item_id, order_id, brand_id, supplier_id,
               supplier_name_snapshot, pickup_address_snapshot,
               product_description_snapshot, destination,
               destination_warehouse_id, destination_address_snapshot,
               status, driver_id, assigned_at, picked_up_at, delivered_at,
               cancelled_at, cancel_reason,
               external_transport_cost, external_transport_currency, external_transport_notes,
               notes, created_at, updated_at,
               driver:drivers!driver_id(id, full_name, vehicle_label, vehicle_type, availability),
               order:orders!order_id(id, order_number, invoice_number, customer_name,
                                     customer_address, customer_city, customer_phone, brand_id),
               brand:brands!brand_id(id, name, primary_color)`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.statuses && data.statuses.length) q = q.in("status", data.statuses);
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    if (data.fromDate) q = q.gte("created_at", data.fromDate);
    if (data.toDate) q = q.lte("created_at", data.toDate);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const countActivePickups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count, error } = await context.supabase
      .from("pickup_orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["pendiente", "asignada", "en_camino", "recogida"]);
    if (error) throw error;
    return count ?? 0;
  });

export const updatePickupBasics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      pickupId: z.string().uuid(),
      pickupAddress: z.string().optional().nullable(),
      destination: z.enum(["bodega", "cliente"]),
      destinationAddress: z.string().optional().nullable(),
      destinationWarehouseId: z.string().uuid().optional().nullable(),
      notes: z.string().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertLogisticsRole(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("pickup_orders")
      .update({
        pickup_address_snapshot: data.pickupAddress?.trim() || null,
        destination: data.destination,
        destination_address_snapshot: data.destinationAddress?.trim() || null,
        destination_warehouse_id: data.destinationWarehouseId || null,
        notes: data.notes?.trim() || null,
      })
      .eq("id", data.pickupId);
    if (error) throw error;
    return { ok: true };
  });

export const assignDriver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ pickupId: z.string().uuid(), driverId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertLogisticsRole(context.supabase, context.userId);
    const { data: drv, error: dErr } = await context.supabase
      .from("drivers").select("id, active, availability, full_name").eq("id", data.driverId).single();
    if (dErr) throw dErr;
    if (!drv.active) throw new Error("Conductor inactivo");

    const { data: pick, error: pErr } = await context.supabase
      .from("pickup_orders").select("status, driver_id").eq("id", data.pickupId).single();
    if (pErr) throw pErr;
    if (["entregada", "cancelada"].includes(pick.status)) {
      throw new Error("La orden ya fue cerrada");
    }

    // If reassigning, free the previous driver
    if (pick.driver_id && pick.driver_id !== data.driverId) {
      await context.supabase.from("drivers")
        .update({ availability: "disponible" })
        .eq("id", pick.driver_id);
    }

    const { error: uErr } = await context.supabase
      .from("pickup_orders")
      .update({
        driver_id: data.driverId,
        status: "asignada",
        assigned_at: new Date().toISOString(),
      })
      .eq("id", data.pickupId);
    if (uErr) throw uErr;

    await context.supabase.from("drivers")
      .update({ availability: "en_ruta" })
      .eq("id", data.driverId);

    return { ok: true };
  });

const UpdateStatusInput = z.object({
  pickupId: z.string().uuid(),
  status: z.enum(["en_camino", "recogida", "entregada", "cancelada"]),
  externalCost: z.number().nonnegative().optional().nullable(),
  externalNotes: z.string().optional().nullable(),
  cancelReason: z.string().optional().nullable(),
});

export const updatePickupStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateStatusInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertLogisticsRole(context.supabase, context.userId);

    const { data: pick, error: pErr } = await context.supabase
      .from("pickup_orders")
      .select(`id, status, driver_id,
               driver:drivers!driver_id(id, vehicle_type)`)
      .eq("id", data.pickupId).single();
    if (pErr) throw pErr;
    if (["entregada", "cancelada"].includes(pick.status)) {
      throw new Error("La orden ya fue cerrada");
    }

    const now = new Date().toISOString();
    const patch: any = { status: data.status };

    if (data.status === "recogida") patch.picked_up_at = now;
    if (data.status === "entregada") {
      patch.delivered_at = now;
      const vt = (pick as any).driver?.vehicle_type as string | undefined;
      if (vt === "externo") {
        if (data.externalCost == null || data.externalCost <= 0) {
          throw new Error("Indica el costo del transporte externo");
        }
      }
      if (data.externalCost != null) patch.external_transport_cost = data.externalCost;
      if (data.externalNotes != null) patch.external_transport_notes = data.externalNotes.trim() || null;
    }
    if (data.status === "cancelada") {
      patch.cancelled_at = now;
      patch.cancel_reason = data.cancelReason?.trim() || "Sin motivo";
    }

    const { error } = await context.supabase
      .from("pickup_orders").update(patch).eq("id", data.pickupId);
    if (error) throw error;

    // Free the driver when the pickup closes
    if ((data.status === "entregada" || data.status === "cancelada") && pick.driver_id) {
      await context.supabase.from("drivers")
        .update({ availability: "disponible" })
        .eq("id", pick.driver_id);
    }

    return { ok: true };
  });
