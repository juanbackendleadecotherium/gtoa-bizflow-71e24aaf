# Plan: ERP Grupo GTOA — Landing inicial + Roadmap por hitos

## Fase 0 (AHORA): Landing de acceso

Antes de tocar base de datos, levantamos una landing limpia y profesional que sirva como punto de entrada al backoffice. Esto te da tiempo para conectar Supabase (Lovable Cloud) sin que el proyecto avance al modelado todavía.

**Qué se construye en esta fase:**

- Ruta `/` (landing) con identidad **Grupo GTOA**:
  - Encabezado con nombre del grupo y bajada corta ("Backoffice corporativo").
  - Mención discreta de las 4 marcas que opera: Espacio Inmobiliario, Montenegro Design, Casa Diseño, GTOA.
  - Dos tarjetas de acceso lado a lado:
    1. **Ingresar al ERP** → botón activo, navega a `/erp` (placeholder por ahora).
    2. **Ingresar al CRM** → botón visible pero deshabilitado / "Próximamente", reservando el espacio.
  - Pie con copyright Grupo GTOA.
- Ruta `/erp` con un placeholder mínimo ("ERP — base lista, módulos en construcción") para que el botón funcione.
- Diseño: paleta sobria corporativa (neutros oscuros + un acento), tipografía con carácter, tokens definidos en `src/styles.css` (sin colores hardcoded en componentes).
- SEO básico por ruta (`title`, `description`, `og:*`) en `/` y `/erp`.

**Lo que NO se hace en Fase 0:**
- No se habilita Lovable Cloud todavía.
- No se crean tablas, ni auth, ni modelos de pedidos/facturas.
- No se construye ningún módulo del ERP aún.

Cuando confirmes que conectaste tu BD de Supabase, arrancamos Hito 1.

---

## Roadmap por hitos (post-landing)

### Hito 1 — Cimientos técnicos y multi-marca
- Activar Lovable Cloud y verificar conexión.
- Modelo `brands` con las 4 marcas (Espacio Inmobiliario, Montenegro Design, Casa Diseño, GTOA) + logo, colores y datos fiscales por marca.
- Autenticación de usuarios internos (email/password) + tabla `user_roles` separada (admin, operativo, finanzas, ventas) con función `has_role` y RLS.
- Layout autenticado `/erp/*` con sidebar, selector de marca activa y guard de sesión.

### Hito 2 — Gestión de pedidos (núcleo operativo)
- Tablas: `customers`, `orders`, `order_items`, `order_status_history`.
- CRUD de pedidos asociado a marca activa.
- Estados operativos configurables (ej. Borrador → Confirmado → En producción → Listo → Entregado → Cerrado).
- Listado con filtros por marca, estado, cliente, fecha.

### Hito 3 — Flujo de producción y seguimiento
- Tablero tipo kanban por estado operativo.
- Asignación de responsables, fechas comprometidas y bitácora por pedido.
- Vista de seguimiento detallada del pedido (timeline de cambios de estado).

### Hito 4 — Dashboard operativo
- KPIs por marca y consolidado: pedidos por estado, tiempos promedio, pedidos atrasados, carga por responsable.
- Gráficos y filtros por rango de fechas.

### Hito 5 — Ventas y gestión financiera básica
- Registro de ventas vinculado a pedidos.
- Métricas financieras básicas: ingresos por marca, ticket promedio, cuentas por cobrar simples.
- Reporte exportable (CSV).

### Hito 6 — Facturación interna personalizada por marca
- Plantilla de factura propia por marca (logo, colores, datos fiscales, numeración independiente).
- Generación de PDF de factura interna asociada a un pedido/venta.
- Historial de facturas filtrable por marca.

### Hito 7 — Organización de producción e historial operativo
- Vistas de capacidad y planificación por marca.
- Historial operativo consultable por pedido, cliente, marca y período.
- Auditoría de cambios sensible (quién cambió qué y cuándo).

### Hito 8 (opcional, futuro) — Activación del CRM
- Habilitar el segundo botón de la landing.
- Definir alcance del CRM en su propio roadmap.

---

## Detalles técnicos (referencia)

- Stack: TanStack Start v1 + React 19 + Tailwind v4 + shadcn/ui (ya presente en el proyecto).
- Rutas file-based en `src/routes/` — la landing reemplaza el placeholder de `src/routes/index.tsx` y se agrega `src/routes/erp.tsx` como placeholder de entrada.
- Backend (a partir de Hito 1): Lovable Cloud (Supabase gestionado) con RLS estricta, roles en tabla aparte, server functions de TanStack Start para lógica protegida.
- Multi-marca: campo `brand_id` en todas las tablas operativas + RLS que filtre por marcas permitidas al usuario.

## Entregable inmediato al aprobar este plan
Solo la **Fase 0**: landing `/` con botón ERP funcional y botón CRM reservado, más placeholder `/erp`. Nada de base de datos hasta que confirmes que ya conectaste Supabase.
