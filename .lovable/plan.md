## Contexto

En Montenegro Design (prefijo `MD-`) las cuentas de cobro se están solapando con Alegra. Estado actual en el ERP (por fecha):

| # | Actual  | Acción            |
|---|---------|-------------------|
| 1 | MD-1931 | **Mantener**      |
| 2 | MD-1934 | → **MD-0001**     |
| 3 | MD-0001 | → MD-0002         |
| 4 | MD-0002 | → MD-0003         |
| 5 | MD-0003 | → MD-0004         |
| 6 | MD-0004 | → MD-0005         |
| 7 | MD-0005 | → MD-0006         |

Además, hay un número `MD-1935` en la bolsa de "liberados" que el sistema entregaría en la próxima venta — hay que eliminarlo para que la siguiente venta sea **MD-0007**.

Hoy el asignador calcula el siguiente número como `MAX(número) + 1`. Si dejamos MD-1931 como está sin más cambios, el próximo saldría `MD-1932`. Por eso también hay que enseñarle al asignador a **ignorar los números heredados de Alegra**.

## Plan

### 1) Migración de base de datos (una sola)

1. Añadir a `orders` la columna `invoice_legacy boolean not null default false` (marca "heredado de Alegra, no cuenta para el consecutivo").
2. Marcar `invoice_legacy = true` en la orden **MD-1931**.
3. Borrar de `released_invoice_numbers` todos los registros de Montenegro Design (elimina `MD-1935`).
4. Renumerar en Montenegro Design, dentro de una transacción, en orden descendente para no colisionar:

   ```text
   MD-0005 → MD-0006
   MD-0004 → MD-0005
   MD-0003 → MD-0004
   MD-0002 → MD-0003
   MD-0001 → MD-0002
   MD-1934 → MD-0001
   ```

   El update se propaga a las tres tablas donde vive el número: `orders`, `invoices` y `invoice_versions`. No se usa `change_invoice_number` para no meter los números viejos en la bolsa de liberados (queremos que desaparezcan, no que se reutilicen).

5. Registrar un evento por orden en `order_audit_log` con `action='invoice_number_renumbered'` y `{from, to, reason: 'reset_consecutivo_alegra'}`, para dejar traza auditable de cada cambio.
6. Reescribir `public.allocate_invoice_number(brand_id)` para que el `MAX(+1)` **excluya** las órdenes con `invoice_legacy = true`. La bolsa de liberados sigue funcionando igual.

### 2) Frontend

Sin cambios en esta iteración. El botón "Editar número de cuenta de cobro" existente sigue disponible por si hay que ajustar algo puntual después.

### 3) Verificación

Después de correr la migración:
- Consultar Montenegro Design y confirmar que las órdenes quedan como MD-1931, MD-0001…MD-0006.
- Verificar que `invoices` e `invoice_versions` reflejan los mismos números.
- Confirmar que `released_invoice_numbers` de la marca queda vacío.
- Simular `SELECT allocate_invoice_number('880ed95d-…')` — debe devolver `MD-0007`.

## Fuera de alcance

- No se tocan otras marcas: el usuario solo pidió el reset en Montenegro Design. Otras marcas siguen con su prefijo y su MAX+1 actual (si más adelante piden lo mismo, se marca la orden "legacy" equivalente y listo).
- No se integra ni se sincroniza con Alegra: es un reset local del ERP hasta que se termine el asentamiento de vendedores.
