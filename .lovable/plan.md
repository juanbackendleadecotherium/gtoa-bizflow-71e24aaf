## Panel de Usuarios y Roles — versión completa

El "Not Found" actual aparece porque la ruta `/erp/settings/users` se acaba de registrar y el árbol del router quedó en caché; al recargar la app la página ya carga. Aprovecho para dejar el panel terminado cubriendo todo el ciclo de vida de una cuenta interna.

### 1. Capacidades del panel (admin only)

**Crear cuenta**
- Nombre, correo, contraseña (con generador automático + botón "copiar"), rol principal, marcas asignadas (multi-select de `brands`), estado activo.
- Opción "enviar credenciales por correo" (usa el sistema de email ya conectado a Resend).
- Validación: email único, password ≥ 8, fuerza visible.

**Listado de usuarios**
- Tabla con: avatar/iniciales, nombre, correo, roles (chips), marcas asignadas, estado (activo/suspendido), último ingreso, fecha de creación.
- Filtros: por rol, por marca, por estado, búsqueda por nombre/correo.
- Paginación simple (50 por página).

**Acciones por usuario** (menú "···"):
- Editar nombre y correo.
- Cambiar / agregar / quitar roles (multi-rol soportado: un usuario puede ser p.ej. `vendedor` + `finanzas`).
- Asignar / quitar marcas (`user_brands`).
- Resetear contraseña (genera nueva o envía link de recuperación).
- Suspender / reactivar cuenta (`banned_until` vía Auth Admin API).
- Forzar cierre de sesión (revoca refresh tokens).
- Eliminar cuenta (con confirmación de doble paso — escribir el correo).

**Seguridad y guardas**
- Toda acción pasa por server functions con `requireSupabaseAuth` + verificación `has_role(admin)`.
- Un admin no puede eliminarse, suspenderse, ni quitarse el rol admin a sí mismo si es el único admin (chequeo en backend).
- Auditoría: tabla nueva `user_admin_audit` que registra quién hizo qué (crear, editar rol, suspender, eliminar) y cuándo.

### 2. Backend (server functions nuevas en `src/lib/admin-users.functions.ts`)

- `listUsers` (mejorada): incluye `last_sign_in_at`, `banned_until`, marcas asignadas, filtros y paginación.
- `updateUserProfile` — nombre / email.
- `setUserRoles` — reemplaza el conjunto de roles del usuario.
- `setUserBrands` — reemplaza marcas asignadas.
- `resetUserPassword` — genera password nuevo o envía recovery link.
- `setUserSuspended` — `banned_until` = 100 años / `none`.
- `signOutUser` — revoca sesiones.
- `deleteUser` — borra cuenta + perfil + roles + marcas.
- Helper `assertNotLastAdmin(userId)` reutilizado en cada acción destructiva.

### 3. Migración SQL

- Tabla `public.user_admin_audit` (actor_user_id, target_user_id, action, details jsonb, created_at) con GRANTs, RLS y policy "solo admins leen".
- Asegurar índice único en `user_roles(user_id, role)` (ya existe según el esquema actual; se valida).

### 4. UI

- Refactor de `_authenticated.erp.settings.users.tsx` en componentes:
  - `UserCreateDialog`, `UserEditDialog`, `UserRolesDialog`, `UserBrandsDialog`, `UserDangerDialog` (suspender / reset / eliminar).
  - Tabla con filtros arriba (Input búsqueda + Select rol + Select marca + Switch "solo activos").
  - Toasts de éxito/error y refetch tras cada mutación.
- Tab adicional "Auditoría" mostrando las últimas 100 acciones del panel.

### Detalles técnicos
- Auth Admin API: `supabaseAdmin.auth.admin.updateUserById({ ban_duration, email, password })`, `.deleteUser()`, `.generateLink({ type: 'recovery' })`, `.signOut(userId)`.
- Roles: enum `app_role` ya existe (`admin`, `operativo`, `finanzas`, `ventas`, `vendedor`). No se agregan nuevos.
- Marcas: usar `user_brands` (ya existente) para el scope multi-marca.
- Toda operación destructiva escribe una fila en `user_admin_audit` dentro del mismo handler.
