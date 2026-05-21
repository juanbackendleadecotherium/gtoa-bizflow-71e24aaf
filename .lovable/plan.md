## Objetivo
Pulir el Hito 1 enfocándonos en la experiencia de autenticación (login/registro) y dejar la arquitectura preparada para que el CRM pueda enchufarse sin reescribir nada.

---

## 1. Desactivar verificación por email (Supabase)

La verificación por correo se controla en el dashboard de Supabase, no por código.

**Acción manual del usuario** (te dejo el link al final):
- `Authentication → Providers → Email → Confirm email = OFF`

Mientras esté activa, `signUp()` devuelve sesión `null` aunque el usuario se cree. Con esto desactivado, `signUp()` devuelve `session` inmediatamente → habilita el auto-login del punto 3.

---

## 2. Mejoras UI/UX en `src/routes/auth.tsx`

### a. Toggle "ver contraseña"
Botón con ícono ojo/ojo-tachado (`Eye` / `EyeOff` de lucide-react) dentro del input. Estado local `showPassword`. Aplica a los dos formularios (signin y signup).

### b. Medidor de fortaleza en tiempo real (solo en signup)
Componente nuevo `src/components/auth/password-strength.tsx`:
- Evalúa: longitud ≥8, minúscula, mayúscula, número, símbolo (5 criterios).
- Barra de progreso segmentada de 5 tramos + etiqueta ("Muy débil → Excelente").
- Colores semánticos del design system (rojo → ámbar → verde) usando tokens, no hex.
- Lista de chequeo debajo mostrando qué falta cumplir.
- Lógica pura, sin dependencias externas (función `scorePassword`).

### c. Validaciones consistentes con Zod
Mover validación de email/password a `src/lib/validation/auth-schemas.ts` (reutilizable por el CRM más adelante). Mínimo 8 caracteres + al menos 3 criterios para permitir submit.

### d. Auto-login tras signup
En `handleSignUp`, si la respuesta trae `data.session` (verificación desactivada), navegar directo a `/erp`. Si por algún motivo viene sin sesión, hacer fallback a `signInWithPassword` con las mismas credenciales.

### e. Pulido visual menor
- Mostrar/ocultar errores de campo inline (no solo toast).
- Botón "Entrar" / "Crear cuenta" con estado disabled hasta cumplir criterios mínimos.
- Microcopy más claro y consistente.

---

## 3. Arquitectura SOLID pensando en el CRM

Sin reescribir nada hoy, dejamos sembradas las piezas correctas para que cuando arranque el módulo CRM enchufe limpio:

**Estructura propuesta** (creamos solo lo necesario para auth ahora):
```text
src/
  features/                ← módulos de negocio (ERP, CRM, shared)
    auth/
      components/          ← PasswordStrength, AuthForm, etc.
      schemas/             ← Zod schemas reutilizables
      hooks/               ← useSignUp, useSignIn (encapsulan supabase)
    erp/                   ← (futuro) órdenes, producción, facturación
    crm/                   ← (futuro) leads, pipeline, oportunidades
  lib/                     ← utilidades cross-feature (use-session ya vive aquí)
  integrations/supabase/   ← cliente único compartido (ya existe)
  routes/                  ← solo composición de rutas, delgadas
```

**Principios aplicados**:
- **S** (Single Responsibility): `auth.tsx` solo orquesta UI; la lógica vive en hooks (`useSignUp`, `useSignIn`).
- **O** (Open/Closed): el medidor de fortaleza acepta reglas como prop → el CRM podrá usar reglas distintas sin modificar el componente.
- **D** (Dependency Inversion): los hooks reciben el cliente Supabase vía import único (`@/integrations/supabase/client`), no se instancia en cada componente.
- **Roles compartidos**: el enum `app_role` ya está pensado para extenderse (`comercial`, `sdr` cuando llegue el CRM) — no tocamos nada hoy.

> Nota: NO refactorizo todo el proyecto ahora. Solo creo `src/features/auth/` con lo nuevo de este hito. El resto migra cuando aporte valor (regla YAGNI).

---

## 4. Archivos a tocar / crear

**Crear:**
- `src/features/auth/components/password-strength.tsx`
- `src/features/auth/components/password-input.tsx` (input + toggle ojo, reutilizable)
- `src/features/auth/schemas/auth-schemas.ts`
- `src/features/auth/hooks/use-auth-actions.ts` (signIn, signUp + auto-login)

**Editar:**
- `src/routes/auth.tsx` (consumir lo anterior, quitar `emailRedirectTo`, auto-navegar tras signup)

**No tocar:**
- Migraciones de BD (todo el esquema del Hito 1 queda igual).
- `_authenticated.erp.tsx`, sidebar, brand selector.

---

## 5. Cómo lo verificas tú

1. Vas a Supabase → Authentication → Providers → Email → desactivas "Confirm email" y guardas.
2. En `/auth` → tab "Crear cuenta":
   - Escribes una contraseña débil → barra roja + lista de criterios faltantes.
   - Vas cumpliendo criterios → barra se llena y cambia de color en vivo.
   - Click en el ojo → ves/ocultas la contraseña.
   - Submit → entras directo a `/erp` sin pasar otra vez por login.
3. En `/auth` → tab "Iniciar sesión": el ojo también funciona.
4. Si dejas la verificación activa por error, el fallback de signIn cubre el caso y verás un toast claro.

---

## Lo que NO incluye este plan
- Recuperación de contraseña (`/reset-password`) — lo dejamos para una iteración siguiente si lo quieres antes del Hito 2.
- OAuth social (Google) — no fue pedido.
- Migrar archivos existentes a `features/` — solo creamos lo nuevo allí.

¿Lo aplicamos así o ajustamos algo antes?
