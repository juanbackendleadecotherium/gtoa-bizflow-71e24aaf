import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supplierPaymentPathPrefix } from "./supplier-payment-upload";

const ConfirmInput = z.object({
  orderItemId: z.string().uuid(),
  amount: z.number().positive(),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  receiptPath: z.string().min(1),
  receiptMime: z.string().optional(),
  receiptSizeBytes: z.number().int().nonnegative().optional(),
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
    if (!supplier.requires_advance_payment) {
      throw new Error("Este proveedor no requiere pago anticipado");
    }

    // 2. Anti-spoof: receipt path must live under this item's prefix
    const expectedPrefix = supplierPaymentPathPrefix(order.brand_id, item.order_id, item.id);
    if (!data.receiptPath.startsWith(expectedPrefix + "/")) {
      throw new Error("Comprobante inválido: ruta fuera del ítem");
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
    const { data: signed, error: sErr } = await supabase.storage
      .from("supplier-payments")
      .createSignedUrl(payment.receipt_path, 3600);
    if (sErr) throw sErr;
    return { ...payment, receipt_signed_url: signed.signedUrl };
  });
