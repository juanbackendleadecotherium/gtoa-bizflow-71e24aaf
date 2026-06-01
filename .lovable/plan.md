
# Hito 2.5 — Factura PDF + bases para envío por correo

Generamos la factura en PDF descargable desde el navegador, con datos de la marca emisora, snapshot del cliente, detalle de productos, totales, abono y saldo. Dejamos toda la base lista (tablas, T&C versionados, datos de marca emisora, botón "Reenviar factura" deshabilitado) para que cuando consigan el dominio + Resend, solo conectemos las piezas finales.

## Alcance — qué SÍ entregamos ahora

1. **Datos fiscales de marca emisora**
   - Nuevos campos en `brands`: `legal_name` (ya existe), `tax_id` (ya existe), `address`, `city`, `phone`, `email`, `website`, `invoice_footer_note`.
   - Pantalla en `Configuración → Marcas` (solo admin) para editar esos datos por marca. Si la marca no tiene los datos, igual se factura — los campos vacíos simplemente no se imprimen.

2. **Términos y condiciones globales**
   - Tabla `terms_versions` (globales para todas las marcas, según indicaste).
   - Campos: `version` (auto-incremental), `content_html`, `is_active`, `created_at`, `created_by`.
   - Una sola versión activa a la vez. Subir nueva versión desactiva la anterior pero conserva el histórico.
   - Tú me compartes el PDF de T&C → yo lo convierto a HTML estructurado y lo cargo como `version 1` activa en la base de datos.
   - Pantalla `Configuración → Términos y condiciones` (solo admin) para ver historial y publicar nueva versión.

3. **Registro de facturas emitidas**
   - Tabla `invoices` con: `order_id`, `brand_id`, `invoice_number` (mismo que ya genera `orders.invoice_number`), `terms_version_id` (snapshot de qué T&C aplican), `pdf_url` (cuando lo subimos a storage), `issued_at`, `issued_by`, `total_snapshot`, `advance_snapshot`, `balance_snapshot`, `customer_snapshot` (jsonb), `items_snapshot` (jsonb), `sent_at` (null por ahora), `sent_to` (null), `send_count` (0).
   - Snapshot completo de la venta al momento de facturar → si editan la venta después, la factura emitida no cambia (integridad fiscal).
   - Bucket de storage `invoices/` (privado, solo accesible por usuarios autenticados con acceso a la marca).

4. **Generación de PDF en el navegador**
   - Librería: `@react-pdf/renderer` (genera PDF puro en cliente, sin servidor).
   - Componente `<InvoiceDocument />` con plantilla profesional:
     - Encabezado: logo de marca (si existe), nombre comercial, razón social, NIT, dirección, teléfono, email
     - Bloque cliente: nombre, tipo/nro documento, teléfono, email, dirección, ciudad, empresa
     - Metadatos: número factura, número de venta, fecha emisión, fecha venta, método de pago
     - Tabla de productos: descripción, cantidad, precio unitario, subtotal
     - Totales: subtotal, descuento, impuesto, total
     - Bloque financiero: abono recibido, saldo pendiente, % pagado
     - Notas de la venta (si existen)
     - Páginas siguientes: Términos y Condiciones de Venta (versión vigente al momento de emisión)
     - Pie: número factura + paginación + nota de marca
   - Colores y tipografía respetando la marca emisora (`primary_color`).

5. **Flujo de emisión desde la venta**
   - En el detalle de venta (`/erp/orders/$id`), nueva sección **"Facturación"** en el sidebar:
     - Si NO está facturada: botón **"Emitir factura"**
       - Valida: venta tiene productos, total > 0, T&C activos cargados, datos básicos del cliente (nombre + documento o teléfono)
       - Genera PDF en cliente → sube a `invoices/{brand_id}/{order_id}-{invoice_number}.pdf` → crea registro en `invoices`
       - Muestra confirmación + abre PDF en nueva pestaña
     - Si YA está facturada: muestra fecha emisión, número, **"Descargar PDF"**, **"Reenviar al cliente"** (deshabilitado con tooltip "Disponible cuando se configure el correo")
   - Auditoría: queda registrado en `order_audit_log` que se emitió factura.

6. **Estados financieros visuales** (sin nuevo flujo, solo badges informativos)
   - En la lista de ventas y detalle: si tiene factura emitida → chip "📄 Facturada"
   - Si `advance_amount >= total` → chip verde "✅ Pagada"
   - Si `0 < advance_amount < total` → chip ámbar "⏳ Abono parcial — Saldo $X"
   - Si `advance_amount = 0` → chip gris "Sin abono"

## Alcance — qué dejamos en STANDBY (estructurado, no funcional)

7. **Base para envío por correo (Resend)**
   - Variable de entorno `RESEND_API_KEY` documentada como pendiente (no la pedimos todavía).
   - Server function `sendInvoiceEmail` esqueleto creada en `src/lib/invoices.functions.ts` con TODO marcado y retorno `{ status: 'not_configured' }` si no hay API key.
   - Botón "Reenviar factura" presente en UI pero deshabilitado con leyenda "Configurar dominio + Resend para activar".
   - Campos `sent_at`, `sent_to`, `send_count` ya existen en `invoices` listos para usarse.
   - Plantilla de email HTML base (sin enviar) preparada en `src/lib/email-templates/invoice.tsx` para cuando llegue el momento.

## Decisiones técnicas

- **PDF en cliente, no servidor**: `@react-pdf/renderer` evita instalar Chromium/Puppeteer en Cloudflare Workers (que ni lo soporta). Más rápido, sin costos extra, render consistente.
- **Snapshot fiscal**: una vez emitida, la factura es inmutable aunque editen la venta. Solo se puede "Anular" (futura iteración) o emitir una nota crédito.
- **Numeración**: reusamos `orders.invoice_number` (`CD-0001`, `EM-0001`, etc.) que ya generas secuencialmente — la factura conserva ese mismo número.
- **T&C globales**: una sola tabla compartida entre marcas, una versión activa, como pediste.

## Archivos que se crearán/modificarán

```text
Migración SQL nueva:
  - ALTER brands: address, city, phone, email, website, invoice_footer_note
  - CREATE TABLE terms_versions (+ RLS + GRANTs)
  - CREATE TABLE invoices (+ RLS + GRANTs)
  - INSERT storage.buckets ('invoices', private)
  - Policies de storage para invoices

Nuevos archivos:
  src/features/invoices/invoice-document.tsx     (componente @react-pdf/renderer)
  src/features/invoices/issue-invoice-button.tsx (botón + lógica de emisión)
  src/features/invoices/invoice-badge.tsx        (chips financieros)
  src/features/invoices/schemas.ts
  src/lib/invoices.functions.ts                  (server fn — esqueleto reenvío)
  src/lib/email-templates/invoice.tsx            (HTML para futuro envío, no se usa aún)
  src/routes/_authenticated.erp.settings.brand-billing.tsx  (editar datos fiscales)
  src/routes/_authenticated.erp.settings.terms.tsx          (gestionar T&C)

Modificados:
  src/routes/_authenticated.erp.orders.$id.tsx   (sección Facturación + chips)
  src/routes/_authenticated.erp.orders.index.tsx (chips financieros en lista)
  src/routes/_authenticated.erp.tsx              (navegación a nuevas pantallas de config)

Dependencia nueva:
  bun add @react-pdf/renderer
```

## Lo que necesito de ti

1. **El PDF de Términos y Condiciones** para cargarlos como versión 1 activa.
2. **Confirmar los datos fiscales** de las 3 marcas (Casa Diseño, Espacio Mobiliario, Montenegro Design) — NIT, dirección, teléfono, email. Si no los tienes a mano ahora, los dejas vacíos y los cargas después por la pantalla de configuración.

## Verificación cuando termine

1. Ir a una venta existente → sidebar muestra sección "Facturación" con botón "Emitir factura"
2. Click → genera PDF, abre en nueva pestaña, se ve con datos correctos de marca, cliente, productos, T&C
3. Recargar la venta → ahora muestra "Facturada el [fecha]" + "Descargar PDF" + "Reenviar al cliente" (gris)
4. En el listado de ventas → la venta aparece con chip "📄 Facturada"
5. Editar la venta → la factura ya emitida NO cambia (snapshot intacto)
6. Configuración → Términos y condiciones → muestra la versión 1 activa
7. Configuración → Datos fiscales → permite editar los datos de cada marca

Cuando consigas el dominio y compres Resend, en Hito 2.6 solo: agregar API key como secreto, verificar dominio, activar el botón de reenvío, y conectar el envío al emitir factura por primera vez. Todo el resto ya queda hecho aquí.
