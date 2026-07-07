## Objetivo

Permitir un tercer tipo de venta —**Pago Paulatino**— que el vendedor puede activar libremente por cliente. Habilita "Enviar a producción" con cualquier anticipo (incluso $0), sin pasar por gerencia y sin esperar al 50%. Cada excepción queda registrada con quién la autorizó, cuándo, y con qué anticipo al momento de enviar a producción.

## Cambios

### 1. Base de datos (una sola migración)

En la tabla `orders`:
- `sale_type` sigue siendo texto; ahora acepta `normal`, `plan_separe` y **`pago_paulatino`**.
- Se agregan 4 campos nuevos de auditoría (todos opcionales, solo se llenan cuando aplica):
  - `paulatino_authorized_by` — vendedor que activó el tipo (usa `seller_id` de la venta).
  - `paulatino_authorized_by_email` — snapshot legible.
  - `paulatino_authorized_at` — fecha/hora en que se marcó Pago Paulatino.
  - `paulatino_advance_at_send` — monto del anticipo el día que se envió a producción.

Trigger `sync_paulatino_authorization`:
- Al crear una venta con `sale_type = 'pago_paulatino'`, autocompleta `paulatino_authorized_by/at/email` desde `seller_id`.
- Al vincular el primer `order_item.production_order_id`, si la venta es Pago Paulatino y `paulatino_advance_at_send` está nulo, lo llena con el `advance_amount` vigente en ese instante.

Además, entrada automática en `order_audit_log` con `action = 'paulatino_send_to_production'` y detalle del monto — reutiliza el registro que ya se usa para otras acciones de la venta.

### 2. UI de creación (`new-customer-dialog.tsx`)

Sección "Tipo de venta" pasa de 2 a 3 tarjetas:

```text
[ Venta normal ]   [ Plan Separe ]   [ Pago Paulatino ]
50% de anticipo     Congela precio    Vendedor autoriza,
                    Arranca al 50%    arranca con cualquier
                                      anticipo, queda en
                                      auditoría
```

Selección `pago_paulatino`:
- Oculta la casilla "Solicitar aprobación gerencial" (no aplica).
- Elimina la validación del 50% en el submit.
- Muestra una nota clara: *"Tú quedas registrado como responsable de esta excepción."*
- Advance permitido en $0.

### 3. Detalle de venta

- `SaleTypeBadge` gana un tercer caso: badge naranja "Pago Paulatino" con ícono `HandCoins`.
- `SaleFlowCard` muestra un bloque naranja informativo cuando aplica: quién autorizó, fecha, y —si ya se envió a producción— con qué anticipo. Sin barra de progreso al 50%.

### 4. Gate de envío a producción

En `send-to-production-button.tsx` y en `canSendToProduction` (`sale-type-badge.tsx`):
- Si `sale_type === 'pago_paulatino'`: se salta la validación del 50% y también la de aprobación gerencial (esa venta no debería tenerla, pero se cubre por defensa).
- Cualquier anticipo (incluido $0) habilita el botón.
- El trigger de BD hace el resto de la auditoría cuando el ítem queda vinculado a la orden de producción.

### 5. Consultas existentes

- `orders` en `orders.index.tsx` y `orders.$id.tsx` ya seleccionan `sale_type`; solo se agrega el nuevo caso al render. No hay cambios de queries a nivel de rendimiento.

## Auditoría — dónde consultarla luego

1. **En la venta**: badge + tarjeta muestran responsable y montos.
2. **`order_audit_log`**: filtrable por `action = 'paulatino_send_to_production'` para revisar todos los envíos anticipados.
3. **Timeline de la venta** (`AuditTimeline`) mostrará automáticamente la entrada.

## Fuera de alcance (intencional)

- Sin marcaciones de "cliente confiable" — decisión libre del vendedor.
- Sin monto mínimo — responsabilidad del vendedor.
- Sin nueva pantalla de administración; toda la revisión sale de `order_audit_log` y la vista de detalle de venta.

## Consumo estimado

Cambios acotados: 1 migración (columnas + trigger), 4 archivos frontend tocados con edits pequeños, sin nuevas server functions ni nuevas rutas.
