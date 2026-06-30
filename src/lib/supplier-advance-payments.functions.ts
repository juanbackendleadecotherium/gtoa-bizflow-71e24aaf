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

    // 1. Load item + supplier
    const { data: item, error: itemErr } = await supabase
      .from("order_items")
      .select("id, order_id, production_order_id, supplier_id, description")
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

    // 5. Trigger the existing production-started flow with paid_at as the effective start.
    //    The RPC inserts the seller_task notification (same type, same recipients).
    const startedAtIso = new Date(data.paidAt + "T12:00:00").toISOString();
    const { error: rpcErr } = await supabase.rpc("start_real_production", {
      p_item_id: item.id,
      p_started_at: startedAtIso,
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
