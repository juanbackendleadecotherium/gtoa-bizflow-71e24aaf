import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function firstOfMonth(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

// ---------- List goals (admin view: all; seller: own) ----------
const ListInput = z.object({
  brandId: z.string().uuid().optional(),
  periodMonth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // any day of the month
});

export type SalesGoalRow = {
  id: string;
  brand_id: string;
  brand_name: string | null;
  seller_id: string | null;
  seller_label: string | null;
  period_month: string;
  amount: number;
  achieved: number;
  progress_pct: number;
};

export const listSalesGoals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const period = firstOfMonth(data.periodMonth);
    const monthStart = period + "T00:00:00";
    const nextMonth = new Date(period + "T00:00:00");
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthEnd = nextMonth.toISOString();

    let query = supabase
      .from("sales_goals")
      .select("id, brand_id, seller_id, period_month, amount")
      .eq("period_month", period);
    if (data.brandId) query = query.eq("brand_id", data.brandId);
    const { data: goals, error } = await query;
    if (error) throw error;

    // Load sales achieved for this month (per brand + per seller)
    let salesQ = supabase
      .from("order_financials")
      .select("brand_id, seller_id, seller_label, total, created_at")
      .gte("created_at", monthStart)
      .lt("created_at", monthEnd);
    if (data.brandId) salesQ = salesQ.eq("brand_id", data.brandId);
    const { data: sales, error: sErr } = await salesQ;
    if (sErr) throw sErr;

    const brandIds = Array.from(new Set((goals ?? []).map((g: any) => g.brand_id)));
    const sellerIds = Array.from(new Set((goals ?? []).map((g: any) => g.seller_id).filter(Boolean)));

    const [{ data: brands }, { data: profiles }] = await Promise.all([
      brandIds.length
        ? supabase.from("brands").select("id, name").in("id", brandIds)
        : Promise.resolve({ data: [] as any[] }),
      sellerIds.length
        ? supabase.from("profiles").select("user_id, display_name, email").in("user_id", sellerIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const bMap = new Map((brands ?? []).map((b: any) => [b.id, b.name]));
    const pMap = new Map(
      (profiles ?? []).map((p: any) => [p.user_id, p.display_name || p.email]),
    );

    const rows: SalesGoalRow[] = (goals ?? []).map((g: any) => {
      const achieved = (sales ?? [])
        .filter((s: any) => s.brand_id === g.brand_id)
        .filter((s: any) => (g.seller_id ? s.seller_id === g.seller_id : true))
        .reduce((acc: number, s: any) => acc + Number(s.total ?? 0), 0);
      return {
        id: g.id,
        brand_id: g.brand_id,
        brand_name: bMap.get(g.brand_id) ?? null,
        seller_id: g.seller_id,
        seller_label: g.seller_id ? (pMap.get(g.seller_id) ?? null) : null,
        period_month: g.period_month,
        amount: Number(g.amount),
        achieved,
        progress_pct: Number(g.amount) > 0 ? Math.round((achieved / Number(g.amount)) * 100) : 0,
      };
    });
    return rows;
  });

// ---------- Upsert (admin only) ----------
const UpsertInput = z.object({
  brandId: z.string().uuid(),
  sellerId: z.string().uuid().nullable(),
  periodMonth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().nonnegative(),
});

export const upsertSalesGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) {
      throw new Error("Solo el administrador puede editar metas.");
    }
    const period = firstOfMonth(data.periodMonth);

    // Find existing
    let existingQ = supabase
      .from("sales_goals")
      .select("id")
      .eq("brand_id", data.brandId)
      .eq("period_month", period);
    if (data.sellerId) existingQ = existingQ.eq("seller_id", data.sellerId);
    else existingQ = existingQ.is("seller_id", null);
    const { data: existing, error: eErr } = await existingQ.maybeSingle();
    if (eErr) throw eErr;

    if (existing) {
      const { error } = await supabase
        .from("sales_goals")
        .update({ amount: data.amount, created_by: userId })
        .eq("id", existing.id);
      if (error) throw error;
      return { id: existing.id };
    }
    const { data: ins, error } = await supabase
      .from("sales_goals")
      .insert({
        brand_id: data.brandId,
        seller_id: data.sellerId,
        period_month: period,
        amount: data.amount,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: ins.id };
  });

const DeleteInput = z.object({ id: z.string().uuid() });
export const deleteSalesGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("sales_goals").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Seller-facing: my progress for a brand/month ----------
const MineInput = z.object({
  brandId: z.string().uuid().optional(),
  periodMonth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const getMyGoalProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MineInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const period = firstOfMonth(data.periodMonth ?? new Date().toISOString().slice(0, 10));
    const monthStart = period + "T00:00:00";
    const nextMonth = new Date(period + "T00:00:00");
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthEnd = nextMonth.toISOString();

    let goalQ = supabase
      .from("sales_goals")
      .select("id, brand_id, amount")
      .eq("seller_id", userId)
      .eq("period_month", period);
    if (data.brandId) goalQ = goalQ.eq("brand_id", data.brandId);
    const { data: goals, error } = await goalQ;
    if (error) throw error;

    let salesQ = supabase
      .from("order_financials")
      .select("brand_id, total")
      .eq("seller_id", userId)
      .gte("created_at", monthStart)
      .lt("created_at", monthEnd);
    if (data.brandId) salesQ = salesQ.eq("brand_id", data.brandId);
    const { data: sales } = await salesQ;

    const brandIds = Array.from(new Set((goals ?? []).map((g: any) => g.brand_id)));
    const { data: brands } = brandIds.length
      ? await supabase.from("brands").select("id, name, primary_color").in("id", brandIds)
      : { data: [] as any[] };
    const bMap = new Map((brands ?? []).map((b: any) => [b.id, b]));

    return (goals ?? []).map((g: any) => {
      const achieved = (sales ?? [])
        .filter((s: any) => s.brand_id === g.brand_id)
        .reduce((a: number, s: any) => a + Number(s.total ?? 0), 0);
      const b = bMap.get(g.brand_id) ?? {};
      return {
        brand_id: g.brand_id,
        brand_name: b.name ?? null,
        brand_color: b.primary_color ?? null,
        goal: Number(g.amount),
        achieved,
        pct: Number(g.amount) > 0 ? Math.round((achieved / Number(g.amount)) * 100) : 0,
        remaining: Math.max(Number(g.amount) - achieved, 0),
      };
    });
  });
