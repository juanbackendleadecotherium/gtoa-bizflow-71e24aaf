/**
 * Plantilla HTML base para envío de facturas por correo.
 * En standby hasta que se configure dominio + Resend.
 */
export type InvoiceEmailData = {
  customer_name: string;
  brand_name: string;
  invoice_number: string;
  total_formatted: string;
  balance_formatted: string;
  brand_color?: string;
  brand_email?: string | null;
  brand_phone?: string | null;
};

export function renderInvoiceEmail(d: InvoiceEmailData): string {
  const accent = d.brand_color || "#0f172a";
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Factura ${d.invoice_number}</title></head>
<body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f8fafc;margin:0;padding:24px;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
    <tr><td style="padding:24px;border-bottom:3px solid ${accent}">
      <h1 style="margin:0;font-size:18px;color:${accent}">${d.brand_name}</h1>
      <p style="margin:4px 0 0;color:#64748b;font-size:13px">Factura ${d.invoice_number}</p>
    </td></tr>
    <tr><td style="padding:24px">
      <p>Hola ${d.customer_name},</p>
      <p>Adjuntamos la factura de tu compra con <strong>${d.brand_name}</strong>.</p>
      <table role="presentation" width="100%" style="margin:16px 0;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#64748b">Total factura</td><td style="text-align:right">${d.total_formatted}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Saldo pendiente</td><td style="text-align:right;font-weight:700">${d.balance_formatted}</td></tr>
      </table>
      <p>Encontrarás el PDF de la factura junto con nuestros Términos y Condiciones de Venta como adjunto en este correo.</p>
      <p style="margin-top:24px;color:#64748b;font-size:13px">
        Cualquier inquietud puedes responder a este correo${d.brand_phone ? ` o escribirnos al ${d.brand_phone}` : ""}.
      </p>
    </td></tr>
    <tr><td style="padding:16px 24px;background:#f8fafc;font-size:12px;color:#94a3b8;text-align:center">
      ${d.brand_name}${d.brand_email ? ` · ${d.brand_email}` : ""}
    </td></tr>
  </table>
</body></html>`;
}
