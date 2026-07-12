// Tipos compartidos para el flujo de borradores de venta.
// Se mantienen aparte para evitar imports circulares entre el diálogo y el listado.

export type CustomerDraft = {
  display_name: string;
  company: string;
  person_type: "" | "natural" | "juridica";
  contact_type: "cliente" | "proveedor";
  doc_type: string;
  doc_number: string;
  phone: string;
  email: string;
  department: string;
  city: string;
  address: string;
  needs_summary: string;
  references: string;
};

export type OrderDraft = {
  invoice_number: string;
  sale_date: string;
  estimated_delivery_date: string;
  payment_method: string;
  advance_amount: number;
  advance_deposit_account: string;
  sale_type: "normal" | "plan_separe" | "pago_paulatino" | "entrega_inmediata";
  request_approval: boolean;
  approval_note: string;
};

export type DraftItem = {
  description: string;
  quantity: number;
  unit_price: number;
};

export type Draft = {
  customer: CustomerDraft;
  order: OrderDraft;
  items: DraftItem[];
  notes: string;
  urgency: string;
};

/**
 * Contenido persistido de un borrador. Además de `Draft`, guardamos:
 * - `rawText`: texto original pegado en la sección de IA.
 * - `paymentProofUrls`: URLs de comprobantes ya subidos a Storage.
 * - `itemImageUrls`: por cada ítem, URLs de imágenes ya subidas a Storage.
 */
export type DraftPayload = {
  draft: Draft;
  rawText: string;
  paymentProofUrls: string[];
  itemImageUrls: string[][];
};

export type OrderDraftRow = {
  id: string;
  brand_id: string;
  seller_id: string;
  payload: DraftPayload;
  customer_name: string | null;
  items_summary: string | null;
  created_at: string;
  updated_at: string;
};
