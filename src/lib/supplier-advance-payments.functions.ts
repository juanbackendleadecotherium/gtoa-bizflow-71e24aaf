import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supplierPaymentPathPrefix } from "./supplier-payment-upload";

const ConfirmInput = z.object({
  orderItemId: z.string().uuid(),
  amount: z.number().positive(),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  receiptPath: z.string().min(1).optional().nullable(),
  receiptMime: z.string().optional().nullable(),
  receiptSizeBytes: z.number().int().nonnegative().optional().nullable(),
});

export const confirmSupplierAdvancePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ConfirmInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;

    // Only finanzas or admin may register a supplier advance payment.
    const { data: roles, error: rolesErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesErr) throw rolesErr;
    const allowed = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "finanzas");
    if (!allowed) {
      throw new Error("Solo el gerente financiero (rol Finanzas) puede registrar este pago.");
    }

    // 1. Load item + supplier
    const { data: item, error: itemErr } = await supabase
      .from("order_items")
      .select("id, order_id, production_order_id, supplier_id, description, negotiated_cost, manufacturing_cost")
      .eq("id", data.orderItemId)
      .maybeSingle();
    if (itemErr) throw itemErr;
    if (!item) throw new Error("Producto no encontrado");
    if (!item.supplier_id) throw new Error("El ítem no tiene proveedor asignado");

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, brand_id")
      .eq("id", item.order_id)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) throw new Error("Pedido no encontrado");

    const { data: supplier, error: supErr } = await supabase
      .from("suppliers")
      .select("id, name, brand_id, requires_advance_payment")
      .eq("id", item.supplier_id)
      .maybeSingle();
    if (supErr) throw supErr;
    if (!supplier) throw new Error("Proveedor no encontrado");

    // 2. Anti-spoof: if a receipt path is provided, it must live under this item's prefix
    if (data.receiptPath) {
      const expectedPrefix = supplierPaymentPathPrefix(order.brand_id, item.order_id, item.id);
      if (!data.receiptPath.startsWith(expectedPrefix + "/")) {
        throw new Error("Comprobante inválido: ruta fuera del ítem");
      }
    }

    // 3. No existing payment
    const { data: existing, error: existErr } = await supabase
      .from("order_item_supplier_payments")
      .select("id")
      .eq("order_item_id", item.id)
      .maybeSingle();
    if (existErr) throw existErr;
    if (existing) throw new Error("Este ítem ya tiene un pago anticipado registrado");

    // 4. Insert payment (RLS validates can_write_brand + supplier flag)
    const userEmail = (claims as { email?: string } | null)?.email ?? null;
    const { data: payment, error: insErr } = await supabase
      .from("order_item_supplier_payments")
      .insert({
        order_item_id: item.id,
        production_order_id: item.production_order_id,
        order_id: item.order_id,
        brand_id: order.brand_id,
        supplier_id: supplier.id,
        supplier_name_snapshot: supplier.name,
        amount: data.amount,
        paid_at: data.paidAt,
        receipt_path: data.receiptPath,
        receipt_mime: data.receiptMime ?? null,
        receipt_size_bytes: data.receiptSizeBytes ?? null,
        created_by: userId,
        created_by_email: userEmail,
      })
      .select()
      .single();
    if (insErr) throw insErr;

    // 5. Notificar al encargado de producción (operativo) para que comparta al proveedor.
    //    Ya NO se inicia producción automáticamente: Alejandra la marca manualmente.
    const cost = Number((item as any).negotiated_cost ?? (item as any).manufacturing_cost ?? 0);
    const pct = cost > 0 ? (data.amount / cost) * 100 : null;
    const { error: rpcErr } = await supabase.rpc("notify_operativo_supplier_paid", {
      p_item_id: item.id,
      p_amount: data.amount,
      p_pct: pct,
    });
    if (rpcErr) throw rpcErr;

    return payment;
  });

const GetInput = z.object({ orderItemId: z.string().uuid() });

export const getSupplierAdvancePaymentForItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => GetInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: payment, error } = await supabase
      .from("order_item_supplier_payments")
      .select("id, amount, paid_at, receipt_path, receipt_mime, supplier_name_snapshot, created_at, created_by_email")
      .eq("order_item_id", data.orderItemId)
      .maybeSingle();
    if (error) throw error;
    if (!payment) return null;
    let receipt_signed_url: string | null = null;
    if (payment.receipt_path) {
      const { data: signed, error: sErr } = await supabase.storage
        .from("supplier-payments")
        .createSignedUrl(payment.receipt_path, 3600);
      if (sErr) throw sErr;
      receipt_signed_url = signed.signedUrl;
    }
    return { ...payment, receipt_signed_url };
  });

const ConfirmFinalInput = z.object({
  orderItemId: z.string().uuid(),
  amount: z.number().positive(),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reference: z.string().optional().nullable(),
});

export const confirmSupplierFinalPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ConfirmFinalInput.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("confirm_supplier_final_payment", {
      _item_id: data.orderItemId,
      _amount: data.amount,
      _paid_at: data.paidAt ?? new Date().toISOString().slice(0, 10),
      _reference: data.reference ?? undefined,
    });
    if (error) throw error;
    return { ok: true };
  });

const FinalPaymentMetaInput = z.object({ orderItemId: z.string().uuid() });

export const getFinalPaymentMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => FinalPaymentMetaInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: item, error } = await context.supabase
      .from("order_items")
      .select("id, description, manufacturing_cost, negotiated_cost, supplier_id, quantity, unit_price")
      .eq("id", data.orderItemId)
      .maybeSingle();
    if (error) throw error;
    if (!item) return null;
    const { data: pays } = await context.supabase
      .from("order_item_supplier_payments")
      .select("amount, payment_type, supplier_name_snapshot")
      .eq("order_item_id", data.orderItemId);
    const advance = (pays ?? []).find((p: any) => p.payment_type === "advance");
    const final = (pays ?? []).find((p: any) => p.payment_type === "final");
    const cost = Number(item.negotiated_cost ?? item.manufacturing_cost ?? 0);
    const paid = Number(advance?.amount ?? 0);
    return {
      supplierName: advance?.supplier_name_snapshot ?? null,
      totalCost: cost,
      paid,
      remaining: Math.max(cost - paid, 0),
      finalPaid: !!final,
    };
  });

// ============================================================
// Finance queue: pending supplier advance payments (admin/finanzas only)
// ============================================================

async function assertFinanceRole(supabase: any, userId: string) {
  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw error;
  const ok = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "finanzas");
  if (!ok) throw new Error("No autorizado (requiere rol Finanzas o Admin).");
}

export type PendingSupplierPayment = {
  order_item_id: string;
  order_id: string;
  production_order_id: string | null;
  brand_id: string;
  brand_name: string | null;
  brand_color: string | null;
  invoice_number: string | null;
  order_number: string | null;
  product: string;
  supplier_id: string;
  supplier_name: string;
  cost: number;
  advance_pct: number;
  suggested_amount: number;
  quotation_date: string | null;
};

export const listPendingSupplierPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertFinanceRole(supabase, userId);

    // 1. Items with a supplier + quotation_date + cost, and no advance payment yet.
    const { data: items, error } = await supabase
      .from("order_items")
      .select(
        "id, order_id, production_order_id, description, supplier_id, negotiated_cost, manufacturing_cost, quotation_date"
      )
      .not("supplier_id", "is", null)
      .not("quotation_date", "is", null)
      .eq("ready_for_advance_payment", true);
    if (error) throw error;

    const raw = (items ?? []).filter((it: any) => {
      const cost = it.negotiated_cost ?? it.manufacturing_cost;
      return cost != null && Number(cost) > 0;
    });
    if (raw.length === 0) return [] as PendingSupplierPayment[];

    const ids = raw.map((r: any) => r.id);
    const { data: paid, error: paidErr } = await supabase
      .from("order_item_supplier_payments")
      .select("order_item_id, payment_type")
      .in("order_item_id", ids);
    if (paidErr) throw paidErr;
    const paidSet = new Set(
      (paid ?? [])
        .filter((p: any) => (p.payment_type ?? "advance") === "advance")
        .map((p: any) => p.order_item_id)
    );
    const pendingItems = raw.filter((r: any) => !paidSet.has(r.id));
    if (pendingItems.length === 0) return [] as PendingSupplierPayment[];

    const orderIds = Array.from(new Set(pendingItems.map((r: any) => r.order_id)));
    const supplierIds = Array.from(new Set(pendingItems.map((r: any) => r.supplier_id)));

    const [{ data: orders, error: oErr }, { data: suppliers, error: sErr }] = await Promise.all([
      supabase.from("orders").select("id, invoice_number, order_number, brand_id").in("id", orderIds),
      supabase.from("suppliers").select("id, name, advance_payment_pct, brand_id").in("id", supplierIds),
    ]);
    if (oErr) throw oErr;
    if (sErr) throw sErr;

    const brandIds = Array.from(new Set((orders ?? []).map((o: any) => o.brand_id)));
    const { data: brands, error: bErr } = await supabase
      .from("brands").select("id, name, primary_color").in("id", brandIds);
    if (bErr) throw bErr;

    const oMap = new Map((orders ?? []).map((o: any) => [o.id, o]));
    const sMap = new Map((suppliers ?? []).map((s: any) => [s.id, s]));
    const bMap = new Map((brands ?? []).map((b: any) => [b.id, b]));

    const rows: PendingSupplierPayment[] = pendingItems.map((it: any) => {
      const o = oMap.get(it.order_id) ?? {};
      const s = sMap.get(it.supplier_id) ?? {};
      const b = bMap.get(o.brand_id) ?? {};
      const cost = Number(it.negotiated_cost ?? it.manufacturing_cost ?? 0);
      const pct = Number(s.advance_payment_pct ?? 50);
      return {
        order_item_id: it.id,
        order_id: it.order_id,
        production_order_id: it.production_order_id,
        brand_id: o.brand_id,
        brand_name: b.name ?? null,
        brand_color: b.primary_color ?? null,
        invoice_number: o.invoice_number ?? null,
        order_number: o.order_number ?? null,
        product: (it.description ?? "Producto").split("\n")[0] || "Producto",
        supplier_id: it.supplier_id,
        supplier_name: s.name ?? "—",
        cost,
        advance_pct: pct,
        suggested_amount: Math.round(cost * (pct / 100)),
        quotation_date: it.quotation_date,
      };
    });

    rows.sort((a, b) => {
      const da = a.quotation_date ?? "";
      const db = b.quotation_date ?? "";
      return da.localeCompare(db);
    });

    return rows;
  });

export const getPendingSupplierPaymentsCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Any signed-in user can ask; non-finance simply see 0.
    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", userId);
    const ok = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "finanzas");
    if (!ok) return { count: 0, total: 0 };

    // Reuse the same shape; count via tasks assigned to this user is the fastest badge.
    const { count, error } = await supabase
      .from("seller_tasks")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", userId)
      .eq("type", "pay_supplier_advance")
      .eq("status", "pendiente");
    if (error) throw error;
    return { count: count ?? 0, total: 0 };
  });

