import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FiltersSchema = z.object({
  brandId: z.string().uuid().nullable().optional(),
  sellerId: z.string().uuid().nullable().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type Filters = z.infer<typeof FiltersSchema>;

// ------- helpers -------
function applyOrderFilters<T extends { eq: Function; gte: Function; lte: Function }>(
  q: T,
  f: Filters,
  dateColumn: string,
): T {
  let qq: any = q;
  if (f.brandId) qq = qq.eq("brand_id", f.brandId);
  if (f.sellerId) qq = qq.eq("seller_id", f.sellerId);
  qq = qq.gte(dateColumn, f.from).lte(dateColumn, `${f.to}T23:59:59`);
  return qq as T;
}

function isoWeekKey(d: Date): string {
  // ISO week Monday-based; key = YYYY-Www
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function weekRangeFromKey(key: string): { start: string; end: string } {
  const [yStr, wStr] = key.split("-W");
  const year = Number(yStr);
  const week = Number(wStr);
  // ISO week 1 is week containing Jan 4
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

// ============================================================
// KPI 2 — Delivery compliance
// ============================================================
export const getDeliveryCompliance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FiltersSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    let q: any = supabase
      .from("orders")
      .select(
        "id, brand_id, seller_id, invoice_number, sale_date, estimated_delivery_date, customer_name, customer_id",
      )
      .not("estimated_delivery_date", "is", null);
    q = applyOrderFilters(q, data, "sale_date");
    const { data: orders, error } = await q;
    if (error) throw error;
    const orderIds: string[] = (orders ?? []).map((o: any) => o.id);
    if (orderIds.length === 0) {
      return { onTime: 0, total: 0, pending: 0, rows: [] as any[] };
    }

    const { data: pickups, error: pErr } = await supabase
      .from("pickup_orders")
      .select("order_id, destination, delivered_at, status")
      .in("order_id", orderIds)
      .eq("destination", "cliente")
      .not("delivered_at", "is", null);
    if (pErr) throw pErr;

    const deliveredMap = new Map<string, string>();
    for (const p of pickups ?? []) {
      const cur = deliveredMap.get(p.order_id);
      if (!cur || (p.delivered_at && p.delivered_at > cur)) {
        deliveredMap.set(p.order_id, p.delivered_at!);
      }
    }

    const rows: any[] = [];
    let onTime = 0;
    let delivered = 0;
    let pending = 0;
    for (const o of orders ?? []) {
      const deliveredAt = deliveredMap.get(o.id);
      if (!deliveredAt) {
        pending += 1;
        continue;
      }
      delivered += 1;
      const promisedDate = o.estimated_delivery_date as string;
      const deliveredDate = deliveredAt.slice(0, 10);
      const diffDays = Math.round(
        (new Date(deliveredDate).getTime() - new Date(promisedDate).getTime()) / 86400000,
      );
      const late = diffDays > 0;
      if (!late) onTime += 1;
      rows.push({
        orderId: o.id,
        customerName: o.customer_name,
        invoiceNumber: o.invoice_number,
        promisedDate,
        deliveredDate,
        diffDays,
        late,
      });
    }
    rows.sort((a, b) => b.diffDays - a.diffDays);
    return { onTime, total: delivered, pending, rows };
  });

// ============================================================
// KPI 3 — Margin compliance
// ============================================================
export const getMarginCompliance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FiltersSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const MIN_MARGIN = 45;

    let oq: any = supabase
      .from("orders")
      .select("id, brand_id, seller_id, invoice_number, sale_date");
    oq = applyOrderFilters(oq, data, "sale_date");
    const { data: orders, error: oErr } = await oq;
    if (oErr) throw oErr;
    const orderIds: string[] = (orders ?? []).map((o: any) => o.id);
    if (orderIds.length === 0) {
      return { compliant: 0, nonCompliant: 0, noCost: 0, total: 0, rows: [], noCostRows: [] };
    }
    const orderMap = new Map<string, any>();
    for (const o of orders ?? []) orderMap.set(o.id, o);

    const { data: items, error: iErr } = await supabase
      .from("order_items")
      .select("id, order_id, description, quantity, unit_price, manufacturing_cost, negotiated_cost")
      .in("order_id", orderIds);
    if (iErr) throw iErr;

    let compliant = 0;
    let nonCompliant = 0;
    let noCost = 0;
    const rows: any[] = [];
    const noCostRows: any[] = [];
    for (const it of items ?? []) {
      const qty = Number(it.quantity ?? 0);
      const price = Number(it.unit_price ?? 0);
      const sale = qty * price;
      const cost = it.negotiated_cost != null
        ? Number(it.negotiated_cost)
        : it.manufacturing_cost != null
          ? Number(it.manufacturing_cost)
          : null;
      const order = orderMap.get(it.order_id);
      if (sale <= 0 || cost == null || cost <= 0) {
        noCost += 1;
        noCostRows.push({
          itemId: it.id,
          description: it.description,
          invoiceNumber: order?.invoice_number ?? null,
          orderId: it.order_id,
          sale,
        });
        continue;
      }
      const margin = ((sale - cost) / sale) * 100;
      if (margin >= MIN_MARGIN) {
        compliant += 1;
      } else {
        nonCompliant += 1;
        rows.push({
          itemId: it.id,
          description: it.description,
          invoiceNumber: order?.invoice_number ?? null,
          orderId: it.order_id,
          sale,
          cost,
          marginPct: margin,
        });
      }
    }
    rows.sort((a, b) => a.marginPct - b.marginPct);
    return {
      compliant,
      nonCompliant,
      noCost,
      total: compliant + nonCompliant,
      rows,
      noCostRows,
    };
  });

// ============================================================
// KPI 4 — Weekly collection forecast with carry-over
// ============================================================
export const getWeeklyCollectionForecast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FiltersSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Load orders whose estimated_delivery_date is inside the filter range
    let oq: any = supabase
      .from("orders")
      .select(
        "id, brand_id, seller_id, invoice_number, customer_name, total, advance_amount, estimated_delivery_date",
      )
      .not("estimated_delivery_date", "is", null);
    oq = applyOrderFilters(oq, data, "estimated_delivery_date");
    const { data: orders, error: oErr } = await oq;
    if (oErr) throw oErr;

    const orderIds: string[] = (orders ?? []).map((o: any) => o.id);
    if (orderIds.length === 0) {
      return { weeks: [], currentWeekKey: isoWeekKey(new Date()) };
    }

    const { data: payments, error: pErr } = await supabase
      .from("order_payments")
      .select("order_id, amount, paid_at")
      .in("order_id", orderIds);
    if (pErr) throw pErr;

    const paidByOrder = new Map<string, number>();
    const paymentsByWeek = new Map<string, { total: number; items: any[] }>();
    for (const p of payments ?? []) {
      const amt = Number(p.amount ?? 0);
      paidByOrder.set(p.order_id, (paidByOrder.get(p.order_id) ?? 0) + amt);
      if (p.paid_at) {
        const wk = isoWeekKey(new Date(p.paid_at));
        const bucket = paymentsByWeek.get(wk) ?? { total: 0, items: [] };
        bucket.total += amt;
        bucket.items.push({ orderId: p.order_id, amount: amt, paidAt: p.paid_at });
        paymentsByWeek.set(wk, bucket);
      }
    }

    // Group projected balances by target week
    type Invoice = {
      orderId: string;
      invoiceNumber: string | null;
      customerName: string | null;
      balance: number;
      promisedDate: string;
    };
    const projectedByWeek = new Map<string, Invoice[]>();
    for (const o of orders ?? []) {
      const total = Number(o.total ?? 0);
      const advance = Number(o.advance_amount ?? 0);
      const paid = paidByOrder.get(o.id) ?? 0;
      const balance = Math.max(0, total - advance - paid);
      if (balance <= 0) continue;
      const wk = isoWeekKey(new Date(o.estimated_delivery_date));
      const list = projectedByWeek.get(wk) ?? [];
      list.push({
        orderId: o.id,
        invoiceNumber: o.invoice_number ?? null,
        customerName: o.customer_name ?? null,
        balance,
        promisedDate: o.estimated_delivery_date,
      });
      projectedByWeek.set(wk, list);
    }

    // Build the full week list from min(projected) to max(current week, max projected)
    const weekKeys = new Set<string>([...projectedByWeek.keys(), ...paymentsByWeek.keys()]);
    const currentWeekKey = isoWeekKey(new Date());
    weekKeys.add(currentWeekKey);
    const sorted = [...weekKeys].sort();

    // Fill contiguous weeks between min and max
    const filled: string[] = [];
    if (sorted.length > 0) {
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const { start } = weekRangeFromKey(first);
      const { start: lastStart } = weekRangeFromKey(last);
      let cursor = new Date(start + "T00:00:00Z");
      const stop = new Date(lastStart + "T00:00:00Z");
      while (cursor.getTime() <= stop.getTime()) {
        filled.push(isoWeekKey(cursor));
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      }
    }

    // Compute per-week rollup
    let carry = 0;
    let carryOrderIds = new Set<string>(); // orders still pending from earlier weeks
    const weeks: any[] = [];
    for (const wk of filled) {
      const { start, end } = weekRangeFromKey(wk);
      const invoices = projectedByWeek.get(wk) ?? [];
      const projectedNew = invoices.reduce((s, i) => s + i.balance, 0);

      // Carry-in invoices = balances still unpaid from prior weeks
      const carryInvoices: Invoice[] = [];
      for (const [pk, list] of projectedByWeek.entries()) {
        if (pk >= wk) continue;
        for (const inv of list) {
          if (carryOrderIds.has(inv.orderId)) carryInvoices.push(inv);
        }
      }
      const carryIn = carry;
      const projectedTotal = projectedNew + carryIn;
      const collected = Math.min(paymentsByWeek.get(wk)?.total ?? 0, projectedTotal);
      const carryOut = Math.max(0, projectedTotal - collected);

      // Update carry set: add this week's invoices; remove nothing precise
      // (we treat carry balance as aggregate, invoice-level breakdown is illustrative)
      for (const inv of invoices) carryOrderIds.add(inv.orderId);

      weeks.push({
        weekKey: wk,
        weekStart: start,
        weekEnd: end,
        projectedNew,
        carryIn,
        projectedTotal,
        collected,
        carryOut,
        newInvoices: invoices,
        carryInvoices,
      });
      carry = carryOut;
    }

    return { weeks, currentWeekKey };
  });

// ============================================================
// Sellers list (for filter)
// ============================================================
export const listAnalyticsSellers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("orders")
      .select("seller_id")
      .not("seller_id", "is", null);
    if (error) throw error;
    const ids = Array.from(new Set((data ?? []).map((r: any) => r.seller_id).filter(Boolean)));
    if (ids.length === 0) return [];
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("user_id, display_name, email")
      .in("user_id", ids);
    if (pErr) throw pErr;
    return (profiles ?? [])
      .map((p: any) => ({ id: p.user_id, name: p.display_name || p.email }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
  });
