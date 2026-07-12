## Borradores de venta

Hoy al abrir "Nueva venta" y llenar el formulario, al dar **Crear cliente + venta** se inserta la orden y el trigger del backend asigna un `invoice_number` real. Si el vendedor cierra el diálogo, cambia de pestaña o pierde el navegador, todo lo diligenciado se pierde. No existe manera de retomar la venta después.

Vamos a agregar un flujo de **borradores** con dos vías de guardado:

- **Manual**: botón "Guardar borrador" en el footer del diálogo.
- **Automático**: mientras el vendedor escribe, el borrador se guarda solo cada pocos segundos (debounce), de modo que si cierra el diálogo, la pestaña o el navegador sin querer, la venta queda persistida y puede retomarse.

El borrador **nunca consume número de factura**: el `invoice_number` se asigna solo cuando el vendedor confirma "Crear cliente + venta".

### Alcance funcional

1. **Autoguardado como borrador** dentro del diálogo "Nueva venta":
   - Un `useEffect` con debounce (~1.5s) observa `draft`, `paymentProof` e `itemImages`.
   - Si hay contenido significativo (al menos nombre del cliente **o** un ítem con descripción **o** texto pegado de WhatsApp), se hace `upsert` silencioso en `order_drafts`.
   - Al primer autoguardado se genera el `draftId` y se mantiene en estado local; los siguientes reutilizan ese id.
   - Indicador discreto en el header del diálogo: "Borrador guardado hace unos segundos" / "Guardando…".
   - Al cerrar el diálogo con contenido no confirmado, se dispara un último flush inmediato (no debounced) para no perder los últimos cambios.

2. **Guardar borrador manual** en el footer del diálogo:
   - Botón "Guardar borrador" junto a *Cancelar* y *Crear cliente + venta*.
   - Fuerza un flush inmediato del autoguardado, muestra toast de confirmación y cierra el diálogo.

3. **Persistencia de imágenes**:
   - Los comprobantes de pago e imágenes de productos se suben a Storage bajo `drafts/{draftId}/…` para que sobrevivan al cierre del navegador.
   - Se guardan como URLs dentro del payload del borrador.
   - Subida bajo demanda: cada archivo nuevo se sube al Storage cuando pasa por el autoguardado, para no dejar solo `File` objects en memoria.

4. **Listado de borradores** en `/erp/orders`:
   - Nueva sección **"Borradores"** encima de la tabla actual (con contador).
   - Cada fila muestra: nombre del cliente (o "Sin nombre"), resumen de ítems, marca, fecha de última edición, vendedor.
   - Acciones por fila: **Abrir** (reabre el diálogo precargado) y **Eliminar** (con confirm).
   - El vendedor solo ve sus propios borradores. Admin / finanzas ven todos los de la marca activa.

5. **Reabrir un borrador**:
   - `NewCustomerDialog` acepta props opcionales `draftId` y `initialDraft`.
   - Al montarse con `initialDraft`, hidrata el `useState<Draft>` con esos valores, omite la precarga del `invoice_number` y muestra las imágenes remotas ya cargadas en el `ImageUploader`.
   - El autoguardado continúa actualizando **ese mismo** borrador (no crea uno nuevo).

6. **Confirmar "Crear cliente + venta" desde un borrador**:
   - Ejecuta el flujo actual (insert en `orders` con `invoice_number: null` para que el trigger asigne).
   - Tras el éxito, elimina el borrador y su carpeta en Storage.

7. **Número de factura**: se mantiene la conducta actual — solo se asigna cuando el registro entra a `orders` vía el trigger `orders_assign_invoice_number`. Los borradores nunca reservan consecutivo.

### Detalles técnicos

**Base de datos (migración):**
```sql
CREATE TABLE public.order_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  customer_name text,
  items_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_drafts TO authenticated;
GRANT ALL ON public.order_drafts TO service_role;
ALTER TABLE public.order_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seller manages own drafts"
  ON public.order_drafts FOR ALL TO authenticated
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

CREATE POLICY "admin/finance read drafts"
  ON public.order_drafts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finanzas'));

CREATE POLICY "admin deletes any draft"
  ON public.order_drafts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
```
Se agrega también el trigger de `updated_at`.

**Storage:** los archivos de borrador se suben al bucket existente `order-images` bajo `drafts/{draftId}/…`. Al confirmar la venta las URLs se copian tal cual al `order_items.images` / `orders.payment_proof_url` (funcionan igual, quedan en el prefijo `drafts/…`; una tarea posterior puede reubicarlas si se vuelve un problema).

**Frontend:**
- `src/features/customers/new-customer-dialog.tsx`:
  - Nuevos props: `draftId?: string`, `initialDraft?: Draft & { paymentProofUrls?: string[]; itemImageUrls?: string[][] }`.
  - Hidratar `useState` desde `initialDraft` cuando existe.
  - Nuevo hook `useDraftAutosave({ draft, paymentProof, itemImages, brandId, draftId, setDraftId })`:
    - `useEffect` con `setTimeout` de 1500ms sobre cambios en las dependencias.
    - Comprueba "contenido significativo" antes de guardar.
    - Sube archivos nuevos a `drafts/{draftId}` y sustituye `PendingImage` por URLs en el payload.
    - Hace `upsert` en `order_drafts` con `{ id: draftId, brand_id, seller_id, payload, customer_name, items_summary }`.
    - Expone `status: "idle" | "saving" | "saved" | "error"` y `lastSavedAt` para el indicador visual.
  - Flush final en `handleOpenChange(false)` antes de cerrar (con contenido significativo).
  - Nuevo botón "Guardar borrador" en el footer que llama a `flush()` + `handleOpenChange(false)`.
  - En `saveMutation.onSuccess`, si `draftId` estaba definido → `DELETE from order_drafts where id = draftId` + limpiar prefijo Storage.
- Nuevo componente `src/features/orders/drafts-panel.tsx`:
  - Lista de borradores del vendedor / marca con acciones *Abrir* y *Eliminar*.
- `src/routes/_authenticated.erp.orders.index.tsx`:
  - Estado local `openDraft: { id: string; data: Draft } | null`.
  - Renderiza `<DraftsPanel onOpen={setOpenDraft} />` antes de la tabla.
  - Pasa `draftId` / `initialDraft` a `<NewCustomerDialog>` cuando `openDraft` está presente.

### No incluido

- No se guardan borradores mientras el usuario está totalmente offline (el autoguardado depende de la red; si falla, se reintenta en el siguiente cambio).
- No se comparten borradores entre vendedores.
- Los archivos de Storage no se reubican físicamente al confirmar la venta.
