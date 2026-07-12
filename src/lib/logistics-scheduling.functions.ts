import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isBusinessDay } from "@/lib/business-days";

async function isLogisticsOrAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin === true) return true;
  const { data: isLog } = await supabase.rpc("has_role", { _user_id: userId, _role: "logistica" });
  return isLog === true;
}

async function assertLogisticsOrAdmin(supabase: any, userId: string) {
  if (!(await isLogisticsOrAdmin(supabase, userId))) {
    throw new Error("No autorizado: requiere rol logística o admin");
  }
}

export const listAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ from: z.string(), to: z.string() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("logistics_availability")
      .select("date, available, note, updated_at")
      .gte("date", data.from)
      .lte("date", data.to)
      .order("date", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

export const setAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      available: z.boolean(),
      note: z.string().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertLogisticsOrAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("logistics_availability")
      .upsert({
        date: data.date,
        available: data.available,
        note: data.note?.trim() || null,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "date" });
    if (error) throw error;
    return { ok: true };
  });

export const seedAvailableBusinessDays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ days: z.number().int().min(1).max(180).default(30) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertLogisticsOrAdmin(context.supabase, context.userId);
    const rows: Array<{ date: string; available: boolean; updated_by: string }> = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let added = 0;
    let cursor = new Date(today);
    while (added < data.days) {
      if (isBusinessDay(cursor)) {
        const iso = cursor.toISOString().slice(0, 10);
        rows.push({ date: iso, available: true, updated_by: context.userId });
        added++;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    const { error } = await context.supabase
      .from("logistics_availability")
      .upsert(rows, { onConflict: "date", ignoreDuplicates: true });
    if (error) throw error;
    return { ok: true, inserted: rows.length };
  });

export const scheduleInvoiceLogistics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      orderId: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Autorización: vendedor de la orden, admin o logística
    const { data: order, error: oErr } = await context.supabase
      .from("orders").select("id, seller_id, brand_id, sale_type").eq("id", data.orderId).single();
    if (oErr || !order) throw new Error("Cuenta de cobro no encontrada");

    const isMine = order.seller_id === context.userId;
    const elevated = await isLogisticsOrAdmin(context.supabase, context.userId);
    if (!isMine && !elevated) throw new Error("No autorizado");

    // Elegibilidad de la cuenta de cobro (estado + saldo) — función centralizada
    const { data: canSchedule, error: eErr } = await context.supabase
      .rpc("invoice_can_schedule_logistics", { _order_id: data.orderId });
    if (eErr) throw eErr;
    if (canSchedule !== true) {
      throw new Error("La cuenta de cobro aún no cumple las condiciones para agendar logística");
    }

    // Validar disponibilidad del día seleccionado
    const { data: av, error: avErr } = await context.supabase
      .from("logistics_availability").select("available").eq("date", data.date).maybeSingle();
    if (avErr) throw avErr;
    if (!av || av.available !== true) {
      throw new Error("El día seleccionado no está disponible");
    }

    const patch: any = {
      scheduled_logistics_date: data.date,
      scheduled_logistics_by: context.userId,
      scheduled_logistics_at: new Date().toISOString(),
    };

    // Entrega inmediata: al agendar, mover a "En entrega / En ruta"
    if ((order as any).sale_type === "entrega_inmediata") {
      const { data: enRuta } = await context.supabase
        .from("order_statuses")
        .select("id")
        .eq("brand_id", (order as any).brand_id)
        .eq("slug", "ei-en-ruta")
        .eq("is_active", true)
        .maybeSingle();
      if (enRuta?.id) patch.status_id = enRuta.id;
    }

    const { error: uErr } = await context.supabase
      .from("orders")
      .update(patch)
      .eq("id", data.orderId);
    if (uErr) throw uErr;
    return { ok: true };
  });

export const clearInvoiceLogisticsSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: order, error: oErr } = await context.supabase
      .from("orders").select("seller_id").eq("id", data.orderId).single();
    if (oErr || !order) throw new Error("Cuenta de cobro no encontrada");
    const isMine = order.seller_id === context.userId;
    const elevated = await isLogisticsOrAdmin(context.supabase, context.userId);
    if (!isMine && !elevated) throw new Error("No autorizado");

    const { error } = await context.supabase
      .from("orders")
      .update({
        scheduled_logistics_date: null,
        scheduled_logistics_by: null,
        scheduled_logistics_at: null,
      })
      .eq("id", data.orderId);
    if (error) throw error;
    return { ok: true };
  });

export const getInvoiceSchedulingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("orders")
      .select("id, total, advance_amount, status_id, scheduled_logistics_date, scheduled_logistics_by, scheduled_logistics_at, order_statuses(slug, name)")
      .eq("id", data.orderId)
      .single();
    if (error) throw error;
    const status = order.order_statuses as any;
    const statusSlug: string = status?.slug ?? "";
    const statusOk = ["pendiente-por-logistica", "pendiente_por_logistica", "terminado"].includes(statusSlug);
    // Saldo: usar la view financiera para coincidir con cartera
    const { data: fin } = await context.supabase
      .from("order_financials").select("balance").eq("order_id", data.orderId).maybeSingle();
    const balance = Number(fin?.balance ?? 0);
    const balanceOk = balance <= 0;
    // QA: no construido aún
    const qaOk = true;
    const canSchedule = statusOk && balanceOk && qaOk;
    return {
      canSchedule,
      conditions: {
        status: { ok: statusOk, label: status?.name ?? statusSlug, slug: statusSlug },
        balance: { ok: balanceOk, balance },
        qa: { ok: qaOk, exists: false },
      },
      scheduledDate: order.scheduled_logistics_date as string | null,
      scheduledAt: order.scheduled_logistics_at as string | null,
    };
  });

export const setAvailabilityBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(366),
      available: z.boolean(),
      note: z.string().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertLogisticsOrAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("set_logistics_availability_bulk", {
      _dates: data.dates,
      _available: data.available,
      _note: data.note ?? undefined,
    });
    if (error) throw error;
    return { ok: true, count: data.dates.length };
  });
