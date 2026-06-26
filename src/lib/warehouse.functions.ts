import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Role helpers
// ---------------------------------------------------------------------------
async function requireRole(
  supabase: any,
  userId: string,
  roles: Array<"admin" | "operativo">,
) {
  for (const r of roles) {
    const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: r });
    if (data === true) return r;
  }
  throw new Error("No autorizado");
}

// ---------------------------------------------------------------------------
// Read: warehouses + zones (admin & operativo)
// ---------------------------------------------------------------------------
export const listWarehousesWithZones = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: warehouses, error } = await supabase
      .from("warehouses")
      .select("id, name, address, active, created_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    const { data: zones, error: zErr } = await supabase
      .from("warehouse_zones")
      .select("id, warehouse_id, zone_code, description, capacity_units, active, created_at")
      .order("zone_code", { ascending: true });
    if (zErr) throw zErr;
    return (warehouses ?? []).map((w) => ({
      ...w,
      zones: (zones ?? []).filter((z) => z.warehouse_id === w.id),
    }));
  });

// ---------------------------------------------------------------------------
// Admin mutations
// ---------------------------------------------------------------------------
const UpsertWarehouseInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "El nombre es obligatorio"),
  address: z.string().optional().nullable(),
  active: z.boolean().optional(),
});
export const upsertWarehouse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertWarehouseInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, ["admin"]);
    const payload = {
      name: data.name.trim(),
      address: data.address?.trim() || null,
      active: data.active ?? true,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("warehouses").update(payload).eq("id", data.id).select().single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("warehouses").insert(payload).select().single();
    if (error) throw error;
    return row;
  });

const UpsertZoneInput = z.object({
  id: z.string().uuid().optional(),
  warehouseId: z.string().uuid(),
  zoneCode: z.string().min(1, "El código es obligatorio"),
  description: z.string().optional().nullable(),
  capacityUnits: z.number().int().nonnegative().optional().nullable(),
  active: z.boolean().optional(),
});
export const upsertWarehouseZone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertZoneInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, ["admin"]);
    const payload = {
      warehouse_id: data.warehouseId,
      zone_code: data.zoneCode.trim(),
      description: data.description?.trim() || null,
      capacity_units: data.capacityUnits ?? null,
      active: data.active ?? true,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("warehouse_zones").update(payload).eq("id", data.id).select().single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("warehouse_zones").insert(payload).select().single();
    if (error) throw error;
    return row;
  });

export const deleteWarehouseZone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, ["admin"]);
    // Block delete when there are movements referencing the zone (FK RESTRICT also does this)
    const { count } = await context.supabase
      .from("warehouse_movements").select("id", { count: "exact", head: true })
      .eq("zone_id", data.id);
    if ((count ?? 0) > 0) {
      throw new Error("No se puede eliminar la zona: tiene movimientos registrados. Desactívala en su lugar.");
    }
    const { error } = await context.supabase.from("warehouse_zones").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteWarehouse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, ["admin"]);
    const { count } = await context.supabase
      .from("warehouse_zones").select("id", { count: "exact", head: true })
      .eq("warehouse_id", data.id);
    if ((count ?? 0) > 0) {
      throw new Error("No se puede eliminar la bodega: tiene zonas. Elimínalas primero o desactiva la bodega.");
    }
    const { error } = await context.supabase.from("warehouses").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Zone summary (active zones + current occupancy)
// ---------------------------------------------------------------------------
export const listZoneSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: zones, error: zErr } = await supabase
      .from("warehouse_zones")
      .select(`id, zone_code, description, capacity_units, active,
               warehouse:warehouses!warehouse_id(id, name, active)`)
      .order("zone_code", { ascending: true });
    if (zErr) throw zErr;

    const { data: locs, error: lErr } = await supabase
      .from("warehouse_item_locations")
      .select("item_id, current_zone_id")
      .not("current_zone_id", "is", null);
    if (lErr) throw lErr;

    const itemIds = (locs ?? []).map((l: any) => l.item_id).filter((x: any): x is string => !!x);
    const priceByItem = new Map<string, number>();
    if (itemIds.length) {
      const { data: items, error: iErr } = await supabase
        .from("order_items")
        .select("id, unit_price, quantity")
        .in("id", itemIds);
      if (iErr) throw iErr;
      for (const it of items ?? []) {
        priceByItem.set(it.id, Number(it.unit_price ?? 0) * Number(it.quantity ?? 0));
      }
    }

    const counts = new Map<string, number>();
    const values = new Map<string, number>();
    for (const l of locs ?? []) {
      if (!l.current_zone_id) continue;
      counts.set(l.current_zone_id, (counts.get(l.current_zone_id) ?? 0) + 1);
      values.set(
        l.current_zone_id,
        (values.get(l.current_zone_id) ?? 0) + (l.item_id ? priceByItem.get(l.item_id) ?? 0 : 0),
      );
    }
    return (zones ?? []).map((z: any) => ({
      ...z,
      current_count: counts.get(z.id) ?? 0,
      current_value: values.get(z.id) ?? 0,
    }));
  });


// ---------------------------------------------------------------------------
// Zone contents — items currently in a specific zone
// ---------------------------------------------------------------------------
export const listZoneContents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ zoneId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: locs, error } = await supabase
      .from("warehouse_item_locations")
      .select("item_id, last_movement_at")
      .eq("current_zone_id", data.zoneId);
    if (error) throw error;
    const ids = (locs ?? []).map((l) => l.item_id).filter((x): x is string => !!x);
    if (ids.length === 0) return [];
    const { data: items, error: iErr } = await supabase
      .from("order_items")
      .select(`id, description, quantity, unit_price, supplier_id,
               supplier:suppliers!supplier_id(id, name),
               order:orders!order_id(id, order_number, invoice_number, customer_name, customer_doc_number, brand_id)`)
      .in("id", ids);
    if (iErr) throw iErr;
    const locMap = new Map((locs ?? []).map((l) => [l.item_id, l.last_movement_at]));
    return (items ?? []).map((it: any) => ({
      ...it,
      last_movement_at: locMap.get(it.id),
      line_value: Number(it.unit_price ?? 0) * Number(it.quantity ?? 0),
    }));
  });

// ---------------------------------------------------------------------------
// Executive dashboard — read-only inventory view with filters
// ---------------------------------------------------------------------------
export const listExecutiveDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        brandId: z.string().uuid().optional(),
        supplierId: z.string().uuid().optional(),
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("warehouse_item_locations")
      .select("item_id, current_zone_id, last_movement_at")
      .not("current_zone_id", "is", null);
    if (data.fromDate) q = q.gte("last_movement_at", data.fromDate);
    if (data.toDate) q = q.lte("last_movement_at", data.toDate);
    const { data: locs, error: lErr } = await q;
    if (lErr) throw lErr;

    const ids = (locs ?? []).map((l: any) => l.item_id).filter((x: any): x is string => !!x);

    const { data: zones, error: zErr } = await supabase
      .from("warehouse_zones")
      .select(`id, zone_code, description, active,
               warehouse:warehouses!warehouse_id(id, name, active)`)
      .eq("active", true);
    if (zErr) throw zErr;

    let items: any[] = [];
    if (ids.length) {
      const { data: rows, error: iErr } = await supabase
        .from("order_items")
        .select(`id, description, quantity, unit_price, supplier_id,
                 supplier:suppliers!supplier_id(id, name),
                 order:orders!order_id(id, order_number, invoice_number, customer_name, customer_doc_number, brand_id)`)
        .in("id", ids);
      if (iErr) throw iErr;
      items = rows ?? [];
    }
    if (data.brandId) items = items.filter((it) => it.order?.brand_id === data.brandId);
    if (data.supplierId) items = items.filter((it) => it.supplier_id === data.supplierId);

    const itemMap = new Map(items.map((it) => [it.id, it]));
    const locMap = new Map((locs ?? []).map((l: any) => [l.item_id, l]));
    const now = Date.now();

    const result = (zones ?? [])
      .filter((z: any) => z.warehouse?.active)
      .map((z: any) => {
        const zItems = (locs ?? [])
          .filter((l: any) => l.current_zone_id === z.id && itemMap.has(l.item_id))
          .map((l: any) => {
            const it = itemMap.get(l.item_id);
            const last = l.last_movement_at ? new Date(l.last_movement_at).getTime() : now;
            const days = Math.max(0, Math.floor((now - last) / 86400000));
            return {
              id: it.id,
              description: it.description,
              quantity: it.quantity,
              line_value: Number(it.unit_price ?? 0) * Number(it.quantity ?? 0),
              supplier_name: it.supplier?.name ?? null,
              supplier_id: it.supplier_id,
              order_number: it.order?.order_number ?? null,
              invoice_number: it.order?.invoice_number ?? null,
              customer_name: it.order?.customer_name ?? null,
              customer_doc_number: it.order?.customer_doc_number ?? null,
              brand_id: it.order?.brand_id ?? null,
              last_movement_at: l.last_movement_at,
              days_in_warehouse: days,
            };
          });
        return {
          id: z.id,
          zone_code: z.zone_code,
          description: z.description,
          warehouse: z.warehouse,
          items: zItems,
          item_count: zItems.length,
          max_days: zItems.reduce((m, it) => Math.max(m, it.days_in_warehouse), 0),
        };
      });
    return result;
  });

export const listAllSuppliersLite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("suppliers")
      .select("id, name, brand_id")
      .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

// ---------------------------------------------------------------------------
// Item search for forms
// ---------------------------------------------------------------------------
export const listItemsAvailableForIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ search: z.string().optional(), brandId: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Per-item rule: an item is eligible for intake only when it is individually
    // marked finished in production (production_finished_at IS NOT NULL).
    let q = supabase
      .from("order_items")
      .select(`id, description, quantity, production_finished_at,
               order:orders!order_id(id, order_number, invoice_number, customer_name, brand_id, sale_date)`)
      .not("production_finished_at", "is", null)
      .order("production_finished_at", { ascending: false })
      .limit(300);
    if (data.brandId) q = q.eq("order.brand_id", data.brandId);
    const { data: rows, error } = await q;
    if (error) throw error;

    // Exclude items already in warehouse
    const ids = (rows ?? []).map((r: any) => r.id);
    let active = new Set<string>();
    if (ids.length) {
      const { data: locs } = await supabase
        .from("warehouse_item_locations")
        .select("item_id, current_zone_id")
        .in("item_id", ids)
        .not("current_zone_id", "is", null);
      active = new Set((locs ?? []).map((l: any) => l.item_id));
    }
    let filtered = (rows ?? []).filter((r: any) => r.order && !active.has(r.id));
    const term = (data.search ?? "").trim().toLowerCase();
    if (term) {
      filtered = filtered.filter((r: any) =>
        (r.description ?? "").toLowerCase().includes(term) ||
        (r.order?.order_number ?? "").toLowerCase().includes(term) ||
        (r.order?.invoice_number ?? "").toLowerCase().includes(term) ||
        (r.order?.customer_name ?? "").toLowerCase().includes(term),
      );
    }

    // Compute invoice progress per distinct order
    const orderIds = Array.from(new Set(filtered.map((r: any) => r.order?.id).filter(Boolean)));
    const progress = new Map<string, { total: number; finished: number }>();
    if (orderIds.length) {
      const { data: siblings } = await supabase
        .from("order_items")
        .select("id, order_id, description, quantity, production_finished_at")
        .in("order_id", orderIds);
      const groups = new Map<string, any[]>();
      for (const s of siblings ?? []) {
        const arr = groups.get(s.order_id) ?? [];
        arr.push(s);
        groups.set(s.order_id, arr);
      }
      for (const [oid, arr] of groups) {
        progress.set(oid, {
          total: arr.length,
          finished: arr.filter((x: any) => x.production_finished_at).length,
        });
      }
    }

    return filtered.slice(0, 200).map((r: any) => ({
      ...r,
      invoice_progress: r.order?.id ? progress.get(r.order.id) ?? null : null,
    }));
  });


export const listItemsInWarehouse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ search: z.string().optional(), zoneId: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("warehouse_item_locations")
      .select("item_id, current_zone_id, last_movement_at")
      .not("current_zone_id", "is", null);
    if (data.zoneId) q = q.eq("current_zone_id", data.zoneId);
    const { data: locs, error } = await q;
    if (error) throw error;
    const ids = (locs ?? []).map((l: any) => l.item_id).filter((x: any): x is string => !!x);
    if (ids.length === 0) return [];
    const { data: items, error: iErr } = await supabase
      .from("order_items")
      .select(`id, description, quantity,
               order:orders!order_id(id, order_number, invoice_number, customer_name)`)
      .in("id", ids);
    if (iErr) throw iErr;
    const locMap = new Map((locs ?? []).map((l: any) => [l.item_id, l]));
    let merged = (items ?? []).map((it: any) => ({
      ...it,
      zone_id: locMap.get(it.id)?.current_zone_id,
      last_movement_at: locMap.get(it.id)?.last_movement_at,
    }));
    const term = (data.search ?? "").trim().toLowerCase();
    if (term) {
      merged = merged.filter((r: any) =>
        (r.description ?? "").toLowerCase().includes(term) ||
        (r.order?.order_number ?? "").toLowerCase().includes(term) ||
        (r.order?.invoice_number ?? "").toLowerCase().includes(term) ||
        (r.order?.customer_name ?? "").toLowerCase().includes(term),
      );
    }
    return merged.slice(0, 100);
  });

// ---------------------------------------------------------------------------
// Register movement
// ---------------------------------------------------------------------------
const MovementInput = z.object({
  itemId: z.string().uuid(),
  zoneId: z.string().uuid(),
  movementType: z.enum(["in", "out"]),
  movedAt: z.string().optional(),
  reason: z.string().optional(),
  clientInvoice: z.string().optional(),
  clientCedula: z.string().optional(),
  productQuantity: z.number().positive().optional(),
});
export const registerWarehouseMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MovementInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, ["admin", "operativo"]);
    const payload: any = {
      item_id: data.itemId,
      zone_id: data.zoneId,
      movement_type: data.movementType,
      reason: data.reason?.trim() || null,
      client_invoice: data.clientInvoice?.trim() || null,
      client_cedula: data.clientCedula?.trim() || null,
      product_quantity: data.productQuantity ?? 1,
    };
    if (data.movedAt) payload.moved_at = data.movedAt;
    const { data: row, error } = await context.supabase
      .from("warehouse_movements")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
