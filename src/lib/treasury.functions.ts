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
      p_note: data.note ?? null,
    });
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
