import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supplierPaymentPathPrefix } from "./supplier-payment-upload";

const ConfirmInput = z.object({
  orderItemId: z.string().uuid(),
  phaseId: z.string().uuid().optional().nullable(),
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

    // 1. Load item + supplier (or phase-scoped equivalents)
    const { data: item, error: itemErr } = await supabase
      .from("order_items")
      .select("id, order_id, production_order_id, supplier_id, description, negotiated_cost, manufacturing_cost, has_phases")
      .eq("id", data.orderItemId)
      .maybeSingle();
    if (itemErr) throw itemErr;
    if (!item) throw new Error("Producto no encontrado");

    let phase: any = null;
    if (data.phaseId) {
      const { data: ph, error: phErr } = await supabase
        .from("order_item_phases")
        .select("id, order_item_id, order_id, brand_id, production_order_id, supplier_id, name, negotiated_cost, manufacturing_cost")
        .eq("id", data.phaseId)
        .maybeSingle();
      if (phErr) throw phErr;
      if (!ph) throw new Error("Fase no encontrada");
      if (ph.order_item_id !== item.id) throw new Error("La fase no pertenece al ítem");
      if (!ph.supplier_id) throw new Error("La fase no tiene proveedor asignado");
      phase = ph;
    } else {
      if (!item.supplier_id) throw new Error("El ítem no tiene proveedor asignado");
    }

    const effectiveSupplierId = phase ? phase.supplier_id : item.supplier_id;

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
      .eq("id", effectiveSupplierId)
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

    // 3. No existing payment (scoped by phase if phase-mode; by item otherwise)
    let existQ = supabase
      .from("order_item_supplier_payments")
      .select("id")
      .eq("payment_type", "advance");
    if (phase) {
      existQ = existQ.eq("phase_id", phase.id);
    } else {
      existQ = existQ.eq("order_item_id", item.id).is("phase_id", null);
    }
    const { data: existing, error: existErr } = await existQ.maybeSingle();
    if (existErr) throw existErr;
    if (existing) throw new Error(phase ? "Esta fase ya tiene un pago anticipado registrado" : "Este ítem ya tiene un pago anticipado registrado");

    // 4. Insert payment (RLS validates can_write_brand + supplier flag)
    const userEmail = (claims as { email?: string } | null)?.email ?? null;
    const { data: payment, error: insErr } = await supabase
      .from("order_item_supplier_payments")
      .insert({
        order_item_id: item.id,
        phase_id: phase ? phase.id : null,
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
    const costBase = phase
      ? Number(phase.negotiated_cost ?? phase.manufacturing_cost ?? 0)
      : Number((item as any).negotiated_cost ?? (item as any).manufacturing_cost ?? 0);
    const pct = costBase > 0 ? (data.amount / costBase) * 100 : undefined;
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
  phase_id: string | null;
  phase_name: string | null;
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

    // 1a. Item-level: items without phases, with supplier + quotation + cost, approved and unpaid.
    const { data: items, error } = await supabase
      .from("order_items")
      .select(
        "id, order_id, production_order_id, description, supplier_id, negotiated_cost, manufacturing_cost, quotation_date, has_phases"
      )
      .not("supplier_id", "is", null)
      .not("quotation_date", "is", null)
      .eq("ready_for_advance_payment", true);
    if (error) throw error;

    const rawItems = (items ?? []).filter((it: any) => {
      if (it.has_phases) return false;
      const cost = it.negotiated_cost ?? it.manufacturing_cost;
      return cost != null && Number(cost) > 0;
    });

    // 1b. Phase-level: phases with supplier + quotation + cost, approved.
    const { data: phases, error: phErr } = await supabase
      .from("order_item_phases")
      .select(
        "id, order_item_id, order_id, production_order_id, name, supplier_id, negotiated_cost, manufacturing_cost, quotation_date"
      )
      .not("supplier_id", "is", null)
      .not("quotation_date", "is", null)
      .eq("ready_for_advance_payment", true);
    if (phErr) throw phErr;

    const rawPhases = (phases ?? []).filter((p: any) => {
      const cost = p.negotiated_cost ?? p.manufacturing_cost;
      return cost != null && Number(cost) > 0;
    });

    if (rawItems.length === 0 && rawPhases.length === 0) return [] as PendingSupplierPayment[];

    // 2. Exclude those with existing advance payments.
    const allItemIds = Array.from(new Set([
      ...rawItems.map((r: any) => r.id),
      ...rawPhases.map((p: any) => p.order_item_id),
    ]));
    const phaseIds = rawPhases.map((p: any) => p.id);

    const { data: paid, error: paidErr } = await supabase
      .from("order_item_supplier_payments")
      .select("order_item_id, phase_id, payment_type")
      .in("order_item_id", allItemIds.length > 0 ? allItemIds : ["00000000-0000-0000-0000-000000000000"]);
    if (paidErr) throw paidErr;

    const paidItemSet = new Set(
      (paid ?? [])
        .filter((p: any) => (p.payment_type ?? "advance") === "advance" && !p.phase_id)
        .map((p: any) => p.order_item_id)
    );
    const paidPhaseSet = new Set(
      (paid ?? [])
        .filter((p: any) => (p.payment_type ?? "advance") === "advance" && p.phase_id)
        .map((p: any) => p.phase_id)
    );

    const pendingItems = rawItems.filter((r: any) => !paidItemSet.has(r.id));
    const pendingPhases = rawPhases.filter((p: any) => !paidPhaseSet.has(p.id));

    if (pendingItems.length === 0 && pendingPhases.length === 0) return [] as PendingSupplierPayment[];

    // 3. Enrich with orders / suppliers / brands.
    const orderIds = Array.from(new Set([
      ...pendingItems.map((r: any) => r.order_id),
      ...pendingPhases.map((p: any) => p.order_id),
    ]));
    const supplierIds = Array.from(new Set([
      ...pendingItems.map((r: any) => r.supplier_id),
      ...pendingPhases.map((p: any) => p.supplier_id),
    ]));

    // Phase rows also need the parent item's description for a nicer label.
    const phaseParentIds = Array.from(new Set(pendingPhases.map((p: any) => p.order_item_id)));

    const [
      { data: orders, error: oErr },
      { data: suppliers, error: sErr },
      { data: parentItems, error: piErr },
    ] = await Promise.all([
      supabase.from("orders").select("id, invoice_number, order_number, brand_id").in("id", orderIds),
      supabase.from("suppliers").select("id, name, advance_payment_pct, brand_id").in("id", supplierIds),
      phaseParentIds.length > 0
        ? supabase.from("order_items").select("id, description").in("id", phaseParentIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (oErr) throw oErr;
    if (sErr) throw sErr;
    if (piErr) throw piErr;

    const brandIds = Array.from(new Set((orders ?? []).map((o: any) => o.brand_id)));
    const { data: brands, error: bErr } = await supabase
      .from("brands").select("id, name, primary_color").in("id", brandIds);
    if (bErr) throw bErr;

    const oMap = new Map((orders ?? []).map((o: any) => [o.id, o]));
    const sMap = new Map((suppliers ?? []).map((s: any) => [s.id, s]));
    const bMap = new Map((brands ?? []).map((b: any) => [b.id, b]));
    const piMap = new Map((parentItems ?? []).map((p: any) => [p.id, p]));

    const itemRows: PendingSupplierPayment[] = pendingItems.map((it: any) => {
      const o = oMap.get(it.order_id) ?? {};
      const s = sMap.get(it.supplier_id) ?? {};
      const b = bMap.get(o.brand_id) ?? {};
      const cost = Number(it.negotiated_cost ?? it.manufacturing_cost ?? 0);
      const pct = Number(s.advance_payment_pct ?? 50);
      return {
        order_item_id: it.id,
        phase_id: null,
        phase_name: null,
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

    const phaseRows: PendingSupplierPayment[] = pendingPhases.map((ph: any) => {
      const o = oMap.get(ph.order_id) ?? {};
      const s = sMap.get(ph.supplier_id) ?? {};
      const b = bMap.get(o.brand_id) ?? {};
      const parent = piMap.get(ph.order_item_id) ?? {};
      const cost = Number(ph.negotiated_cost ?? ph.manufacturing_cost ?? 0);
      const pct = Number(s.advance_payment_pct ?? 50);
      const parentDesc = ((parent as any).description ?? "Producto").split("\n")[0] || "Producto";
      return {
        order_item_id: ph.order_item_id,
        phase_id: ph.id,
        phase_name: ph.name,
        order_id: ph.order_id,
        production_order_id: ph.production_order_id,
        brand_id: o.brand_id,
        brand_name: b.name ?? null,
        brand_color: b.primary_color ?? null,
        invoice_number: o.invoice_number ?? null,
        order_number: o.order_number ?? null,
        product: `${parentDesc} · ${ph.name}`,
        supplier_id: ph.supplier_id,
        supplier_name: s.name ?? "—",
        cost,
        advance_pct: pct,
        suggested_amount: Math.round(cost * (pct / 100)),
        quotation_date: ph.quotation_date,
      };
    });

    const rows = [...itemRows, ...phaseRows];
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

