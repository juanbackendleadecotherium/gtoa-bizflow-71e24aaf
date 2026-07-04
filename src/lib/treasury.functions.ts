import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TreasuryInvoiceRow = {
  id: string;
  order_id: string;
  brand_id: string;
  brand_name: string | null;
  invoice_number: string | null;
  order_number: string | null;
  customer_name: string | null;
  customer_doc_number: string | null;
  customer_phone: string | null;
  seller_label: string | null;
  issued_at: string;
  total: number;
  paid_total: number;
  balance: number;
  payment_status: "pendiente" | "parcial" | "pagada";
  electronic_invoice_status: "no_facturada" | "facturada";
  electronic_invoice_number: string | null;
  electronic_invoice_issued_at: string | null;
};

export type TreasuryPayment = {
  id: string;
  amount: number;
  paid_at: string;
  method: string | null;
  reference: string | null;
  deposit_account: string | null;
  note: string | null;
  proof_url: string | null;
  created_by_email: string | null;
  created_at: string;
};

export type TreasuryElectronicLog = {
  id: string;
  action: string;
  external_number: string | null;
  note: string | null;
  actor_email: string | null;
  created_at: string;
};

export type TreasuryInvoiceDetail = TreasuryInvoiceRow & {
  items_snapshot: any[];
  payments: TreasuryPayment[];
  electronic_log: TreasuryElectronicLog[];
};

async function assertTreasury(context: any) {
  const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  const rs = (roles ?? []).map((r: any) => r.role);
  if (!(rs.includes("admin") || rs.includes("finanzas"))) {
    throw new Error("Solo administración o finanzas");
  }
}

const ListInput = z.object({
  search: z.string().optional(),
  brandId: z.string().uuid().optional().nullable(),
  paymentStatus: z.enum(["pendiente", "parcial", "pagada", "todas"]).optional(),
  electronicStatus: z.enum(["no_facturada", "facturada", "todas"]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export const listTreasuryInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertTreasury(context);
    const limit = data.limit ?? 200;

    let q = context.supabase
      .from("invoices")
      .select(
        "id, order_id, brand_id, invoice_number, issued_at, total_snapshot, electronic_invoice_status, electronic_invoice_number, electronic_invoice_issued_at, customer_snapshot",
      )
      .order("issued_at", { ascending: false })
      .limit(limit);

    if (data.brandId) q = q.eq("brand_id", data.brandId);
    if (data.electronicStatus && data.electronicStatus !== "todas") q = q.eq("electronic_invoice_status", data.electronicStatus);
    if (data.from) q = q.gte("issued_at", data.from);
    if (data.to) q = q.lte("issued_at", data.to + "T23:59:59");

    const { data: invRows, error } = await q;
    if (error) throw new Error(error.message);
    if (!invRows || invRows.length === 0) return [] as TreasuryInvoiceRow[];

    const orderIds = Array.from(new Set(invRows.map((r: any) => r.order_id)));
    const brandIds = Array.from(new Set(invRows.map((r: any) => r.brand_id)));

    const [{ data: orders }, { data: brands }, { data: payments }] = await Promise.all([
      context.supabase
        .from("orders")
        .select("id, order_number, customer_name, customer_doc_number, customer_phone, seller_id")
        .in("id", orderIds),
      context.supabase.from("brands").select("id, name").in("id", brandIds),
      context.supabase.from("order_payments").select("order_id, amount").in("order_id", orderIds),
    ]);

    const sellerIds = Array.from(new Set((orders ?? []).map((o: any) => o.seller_id).filter(Boolean)));
    const { data: profiles } = sellerIds.length
      ? await context.supabase.from("profiles").select("user_id, display_name, email").in("user_id", sellerIds)
      : { data: [] as any[] };
    const pMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p.display_name || p.email]));
    const oMap = new Map((orders ?? []).map((o: any) => [o.id, o]));
    const bMap = new Map((brands ?? []).map((b: any) => [b.id, b.name]));

    const paidMap = new Map<string, number>();
    for (const p of payments ?? []) {
      paidMap.set(p.order_id, (paidMap.get(p.order_id) ?? 0) + Number(p.amount));
    }

    let rows: TreasuryInvoiceRow[] = invRows.map((inv: any): TreasuryInvoiceRow => {
      const o: any = oMap.get(inv.order_id) ?? {};
      const total = Number(inv.total_snapshot);
      const paid_total = paidMap.get(inv.order_id) ?? 0;
      const balance = total - paid_total;
      const payment_status: TreasuryInvoiceRow["payment_status"] =
        paid_total <= 0 ? "pendiente" : balance <= 0.01 ? "pagada" : "parcial";
      return {
        id: inv.id,
        order_id: inv.order_id,
        brand_id: inv.brand_id,
        brand_name: bMap.get(inv.brand_id) ?? null,
        invoice_number: inv.invoice_number ?? null,
        order_number: o.order_number ?? null,
        customer_name: o.customer_name ?? (inv.customer_snapshot as any)?.name ?? null,
        customer_doc_number: o.customer_doc_number ?? null,
        customer_phone: o.customer_phone ?? null,
        seller_label: o.seller_id ? (pMap.get(o.seller_id) ?? null) : null,
        issued_at: inv.issued_at,
        total,
        paid_total,
        balance,
        payment_status,
        electronic_invoice_status: inv.electronic_invoice_status,
        electronic_invoice_number: inv.electronic_invoice_number ?? null,
        electronic_invoice_issued_at: inv.electronic_invoice_issued_at ?? null,
      };
    });

    if (data.paymentStatus && data.paymentStatus !== "todas") {
      rows = rows.filter((r) => r.payment_status === data.paymentStatus);
    }
    if (data.search && data.search.trim()) {
      const s = data.search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.invoice_number ?? "").toLowerCase().includes(s) ||
          (r.order_number ?? "").toLowerCase().includes(s) ||
          (r.customer_name ?? "").toLowerCase().includes(s) ||
          (r.customer_doc_number ?? "").toLowerCase().includes(s) ||
          (r.customer_phone ?? "").toLowerCase().includes(s) ||
          (r.electronic_invoice_number ?? "").toLowerCase().includes(s),
      );
    }
    return rows;
  });

const DetailInput = z.object({ invoiceId: z.string().uuid() });

export const getTreasuryInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DetailInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertTreasury(context);
    const { data: inv, error } = await context.supabase
      .from("invoices")
      .select(
        "id, order_id, brand_id, invoice_number, issued_at, total_snapshot, items_snapshot, customer_snapshot, electronic_invoice_status, electronic_invoice_number, electronic_invoice_issued_at, electronic_invoice_note",
      )
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error || !inv) throw new Error(error?.message ?? "Factura no encontrada");

    const [{ data: order }, { data: brand }, { data: payments }, { data: logs }] = await Promise.all([
      context.supabase
        .from("orders")
        .select("id, order_number, customer_name, customer_doc_number, customer_phone, seller_id")
        .eq("id", inv.order_id)
        .maybeSingle(),
      context.supabase.from("brands").select("id, name").eq("id", inv.brand_id).maybeSingle(),
      context.supabase
        .from("order_payments")
        .select("id, amount, paid_at, method, reference, deposit_account, note, proof_url, created_by_email, created_at")
        .eq("order_id", inv.order_id)
        .order("paid_at", { ascending: false }),
      context.supabase
        .from("invoice_electronic_log")
        .select("id, action, external_number, note, actor_email, created_at")
        .eq("invoice_id", inv.id)
        .order("created_at", { ascending: false }),
    ]);

    let sellerLabel: string | null = null;
    if (order?.seller_id) {
      const { data: p } = await context.supabase
        .from("profiles")
        .select("display_name, email")
        .eq("user_id", order.seller_id)
        .maybeSingle();
      sellerLabel = p?.display_name || p?.email || null;
    }

    const total = Number(inv.total_snapshot);
    const paid_total = (payments ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0);
    const balance = total - paid_total;
    const payment_status: TreasuryInvoiceRow["payment_status"] =
      paid_total <= 0 ? "pendiente" : balance <= 0.01 ? "pagada" : "parcial";

    const detail: TreasuryInvoiceDetail = {
      id: inv.id,
      order_id: inv.order_id,
      brand_id: inv.brand_id,
      brand_name: brand?.name ?? null,
      invoice_number: inv.invoice_number ?? null,
      order_number: order?.order_number ?? null,
      customer_name: order?.customer_name ?? (inv.customer_snapshot as any)?.name ?? null,
      customer_doc_number: order?.customer_doc_number ?? null,
      customer_phone: order?.customer_phone ?? null,
      seller_label: sellerLabel,
      issued_at: inv.issued_at,
      total,
      paid_total,
      balance,
      payment_status,
      electronic_invoice_status: inv.electronic_invoice_status as "no_facturada" | "facturada",
      electronic_invoice_number: inv.electronic_invoice_number ?? null,
      electronic_invoice_issued_at: inv.electronic_invoice_issued_at ?? null,
      items_snapshot: Array.isArray(inv.items_snapshot) ? inv.items_snapshot : [],
      payments: (payments ?? []) as TreasuryPayment[],
      electronic_log: (logs ?? []) as TreasuryElectronicLog[],
    };
    return detail;
  });

const MarkInput = z.object({
  invoiceId: z.string().uuid(),
  externalNumber: z.string().min(1),
  issuedAt: z.string().optional(),
  note: z.string().optional(),
});

export const markInvoiceElectronic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MarkInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("mark_invoice_electronic", {
      p_invoice_id: data.invoiceId,
      p_external_number: data.externalNumber,
      p_issued_at: data.issuedAt ?? new Date().toISOString(),
      p_note: data.note ?? "",
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const RevertInput = z.object({ invoiceId: z.string().uuid(), reason: z.string().min(5) });

export const revertInvoiceElectronic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RevertInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("revert_invoice_electronic", {
      p_invoice_id: data.invoiceId,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Reconciliation ============

export type ReconciliationBrandRow = {
  brand_id: string;
  brand_name: string | null;
  invoices_count: number;
  invoiced_total: number;
  collected_in_range: number;
  balance_open: number;
};

export type ReconciliationSummary = {
  range: { from: string; to: string };
  invoices_in_range: { count: number; total: number };
  payments_in_range: {
    count: number;
    total: number;
    on_range_invoices: number;
    on_prior_invoices: number;
    unlinked: number;
  };
  open_balance_of_range_invoices: number;
  by_brand: ReconciliationBrandRow[];
};

const ReconInput = z.object({
  brandId: z.string().uuid().optional().nullable(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const getTreasuryReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReconInput.parse(d))
  .handler(async ({ data, context }): Promise<ReconciliationSummary> => {
    await assertTreasury(context);
    const fromIso = data.from;
    const toIso = data.to + "T23:59:59";

    // 1) Invoices issued in range (optionally scoped to brand)
    let invQ = context.supabase
      .from("invoices")
      .select("id, order_id, brand_id, total_snapshot, issued_at")
      .gte("issued_at", fromIso)
      .lte("issued_at", toIso);
    if (data.brandId) invQ = invQ.eq("brand_id", data.brandId);
    const { data: invRange, error: invErr } = await invQ;
    if (invErr) throw new Error(invErr.message);

    const rangeOrderIds = new Set((invRange ?? []).map((i: any) => i.order_id));
    const invoicedTotal = (invRange ?? []).reduce((s, i: any) => s + Number(i.total_snapshot), 0);

    // 2) Payments received in range (all, then scope by order brand if needed)
    const { data: payRange, error: payErr } = await context.supabase
      .from("order_payments")
      .select("id, order_id, amount, paid_at")
      .gte("paid_at", fromIso)
      .lte("paid_at", toIso);
    if (payErr) throw new Error(payErr.message);

    const payOrderIds = Array.from(new Set((payRange ?? []).map((p: any) => p.order_id)));
    let orderBrand = new Map<string, string>();
    if (payOrderIds.length > 0) {
      const { data: ords } = await context.supabase
        .from("orders").select("id, brand_id").in("id", payOrderIds);
      orderBrand = new Map((ords ?? []).map((o: any) => [o.id, o.brand_id]));
    }
    const scopedPayments = (payRange ?? []).filter((p: any) =>
      !data.brandId || orderBrand.get(p.order_id) === data.brandId,
    );

    let anyInvoiceOrderIds = new Set<string>();
    if (payOrderIds.length > 0) {
      const { data: linkedInvs } = await context.supabase
        .from("invoices").select("order_id").in("order_id", payOrderIds);
      anyInvoiceOrderIds = new Set((linkedInvs ?? []).map((i: any) => i.order_id));
    }

    let paymentsTotal = 0, onRange = 0, onPrior = 0, unlinked = 0;
    for (const p of scopedPayments) {
      const amt = Number(p.amount);
      paymentsTotal += amt;
      if (rangeOrderIds.has(p.order_id)) onRange += amt;
      else if (anyInvoiceOrderIds.has(p.order_id)) onPrior += amt;
      else unlinked += amt;
    }

    // 3) Open balance of the range invoices (all payments to those orders, any date)
    const allPaidByOrder = new Map<string, number>();
    if (rangeOrderIds.size > 0) {
      const { data: allP } = await context.supabase
        .from("order_payments").select("order_id, amount").in("order_id", Array.from(rangeOrderIds));
      for (const p of allP ?? []) {
        allPaidByOrder.set(p.order_id, (allPaidByOrder.get(p.order_id) ?? 0) + Number(p.amount));
      }
    }
    let openBalance = 0;
    for (const i of invRange ?? []) {
      const paid = allPaidByOrder.get((i as any).order_id) ?? 0;
      openBalance += Math.max(0, Number((i as any).total_snapshot) - paid);
    }

    // 4) Per-brand breakdown
    const brandIds = Array.from(new Set((invRange ?? []).map((i: any) => i.brand_id)));
    const { data: brands } = brandIds.length
      ? await context.supabase.from("brands").select("id, name").in("id", brandIds)
      : { data: [] as any[] };
    const bMap = new Map((brands ?? []).map((b: any) => [b.id, b.name]));

    const byBrandMap = new Map<string, ReconciliationBrandRow>();
    for (const i of invRange ?? []) {
      const bid = (i as any).brand_id;
      const row = byBrandMap.get(bid) ?? {
        brand_id: bid, brand_name: bMap.get(bid) ?? null,
        invoices_count: 0, invoiced_total: 0, collected_in_range: 0, balance_open: 0,
      };
      row.invoices_count += 1;
      row.invoiced_total += Number((i as any).total_snapshot);
      const paid = allPaidByOrder.get((i as any).order_id) ?? 0;
      row.balance_open += Math.max(0, Number((i as any).total_snapshot) - paid);
      byBrandMap.set(bid, row);
    }
    const invByOrder = new Map((invRange ?? []).map((i: any) => [i.order_id, i]));
    for (const p of scopedPayments) {
      if (!rangeOrderIds.has(p.order_id)) continue;
      const inv: any = invByOrder.get(p.order_id);
      if (!inv) continue;
      const row = byBrandMap.get(inv.brand_id);
      if (row) row.collected_in_range += Number(p.amount);
    }

    return {
      range: { from: data.from, to: data.to },
      invoices_in_range: { count: (invRange ?? []).length, total: invoicedTotal },
      payments_in_range: {
        count: scopedPayments.length,
        total: paymentsTotal,
        on_range_invoices: onRange,
        on_prior_invoices: onPrior,
        unlinked,
      },
      open_balance_of_range_invoices: openBalance,
      by_brand: Array.from(byBrandMap.values()).sort((a, b) => b.invoiced_total - a.invoiced_total),
    };
  });
