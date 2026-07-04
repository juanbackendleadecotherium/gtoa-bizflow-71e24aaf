import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CommissionRow = {
  id: string;
  order_id: string;
  brand_id: string;
  brand_name: string | null;
  seller_id: string;
  seller_label: string | null;
  period_month: string;
  sale_amount: number;
  seller_monthly_sales: number;
  tier_percentage: number;
  commission_amount: number;
  status: "pendiente" | "aprobada" | "rechazada" | "pagada" | "revertida";
  rejection_reason: string | null;
  approved_at: string | null;
  paid_at: string | null;
  paid_reference: string | null;
  order_number: string | null;
  invoice_number: string | null;
  created_at: string;
};

const ListInput = z.object({
  status: z.enum(["pendiente", "aprobada", "rechazada", "pagada", "todas"]).optional(),
  brandId: z.string().uuid().optional(),
  periodMonth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const listCommissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const rs = (roles ?? []).map((r: any) => r.role);
    const isPriv = rs.includes("admin") || rs.includes("finanzas");

    let q = supabase
      .from("commission_requests")
      .select(
        "id, order_id, brand_id, seller_id, seller_label, period_month, sale_amount, seller_monthly_sales, tier_percentage, commission_amount, status, rejection_reason, approved_at, paid_at, paid_reference, created_at",
      )
      .order("created_at", { ascending: false });
    if (!isPriv) q = q.eq("seller_id", userId);
    if (data.status && data.status !== "todas") q = q.eq("status", data.status);
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    if (data.periodMonth) {
      const period = new Date(data.periodMonth + "T00:00:00");
      const first = new Date(period.getFullYear(), period.getMonth(), 1).toISOString().slice(0, 10);
      q = q.eq("period_month", first);
    }
    const { data: rows, error } = await q;
    if (error) throw error;

    const brandIds = Array.from(new Set((rows ?? []).map((r: any) => r.brand_id)));
    const orderIds = Array.from(new Set((rows ?? []).map((r: any) => r.order_id)));
    const [{ data: brands }, { data: orders }] = await Promise.all([
      brandIds.length
        ? supabase.from("brands").select("id, name").in("id", brandIds)
        : Promise.resolve({ data: [] as any[] }),
      orderIds.length
        ? supabase.from("orders").select("id, order_number, invoice_number").in("id", orderIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const bMap = new Map((brands ?? []).map((b: any) => [b.id, b.name]));
    const oMap = new Map((orders ?? []).map((o: any) => [o.id, o]));

    return (rows ?? []).map((r: any): CommissionRow => {
      const o = oMap.get(r.order_id) ?? {};
      return {
        ...r,
        brand_name: bMap.get(r.brand_id) ?? null,
        order_number: o.order_number ?? null,
        invoice_number: o.invoice_number ?? null,
        sale_amount: Number(r.sale_amount),
        seller_monthly_sales: Number(r.seller_monthly_sales),
        tier_percentage: Number(r.tier_percentage),
        commission_amount: Number(r.commission_amount),
      };
    });
  });

const IdInput = z.object({ id: z.string().uuid() });
const RejectInput = z.object({ id: z.string().uuid(), reason: z.string().min(5) });
const PayInput = z.object({ id: z.string().uuid(), reference: z.string().optional().nullable() });

export const approveCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("approve_commission", { _id: data.id });
    if (error) throw error;
    return { ok: true };
  });

export const rejectCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RejectInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("reject_commission", { _id: data.id, _reason: data.reason });
    if (error) throw error;
    return { ok: true };
  });

export const payCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PayInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("pay_commission", {
      _id: data.id,
      _reference: data.reference ?? undefined,
    });
    if (error) throw error;
    return { ok: true };
  });

const BulkPayInput = z.object({
  ids: z.array(z.string().uuid()).min(1),
  reference: z.string().optional().nullable(),
});

export const payCommissionsBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BulkPayInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: count, error } = await context.supabase.rpc("pay_commissions_bulk", {
      _ids: data.ids,
      _reference: data.reference ?? undefined,
    });
    if (error) throw error;
    return { count: (count as number) ?? 0 };
  });

export type CommissionAuditRow = {
  id: string;
  action: "created" | "approved" | "rejected" | "paid" | "reverted";
  actor_label: string | null;
  reason: string | null;
  reference: string | null;
  created_at: string;
};

export const getCommissionAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("get_commission_audit", { _id: data.id });
    if (error) throw error;
    return (rows ?? []) as CommissionAuditRow[];
  });

// Count for sidebar badge (admin only sees pending approvals)
export const getPendingCommissionsCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const rs = (roles ?? []).map((r: any) => r.role);
    if (!rs.includes("admin")) return { count: 0 };
    const { count, error } = await supabase
      .from("commission_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendiente");
    if (error) throw error;
    return { count: count ?? 0 };
  });

// Commission tiers (read + admin edit) --------------------------------
export type CommissionTier = {
  id: string;
  brand_id: string | null;
  min_amount: number;
  max_amount: number | null;
  percentage: number;
  is_active: boolean;
  sort_order: number;
};

export const listCommissionTiers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("commission_tiers")
      .select("id, brand_id, min_amount, max_amount, percentage, is_active, sort_order")
      .order("brand_id", { nullsFirst: true })
      .order("sort_order");
    if (error) throw error;
    return (data ?? []) as CommissionTier[];
  });
