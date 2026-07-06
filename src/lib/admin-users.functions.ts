import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const APP_ROLES = ["admin", "operativo", "finanzas", "ventas", "vendedor", "logistica"] as const;
type AppRole = (typeof APP_ROLES)[number];

async function getActorRoles(ctx: { supabase: any; userId: string }): Promise<AppRole[]> {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { role: AppRole }) => r.role);
}

async function assertCanManageUsers(ctx: { supabase: any; userId: string }): Promise<AppRole[]> {
  const roles = await getActorRoles(ctx);
  if (!roles.includes("admin") && !roles.includes("finanzas")) {
    throw new Error("Solo administradores o gerentes de finanzas pueden gestionar usuarios.");
  }
  return roles;
}

/** Impide que un usuario que no sea admin asigne el rol admin. */
function assertRolesAllowedForActor(actorRoles: AppRole[], targetRoles: AppRole[]) {
  if (actorRoles.includes("admin")) return;
  if (targetRoles.includes("admin")) {
    throw new Error("Solo un administrador puede asignar el rol de administrador.");
  }
}

// Retro-compat: algunas rutas todavía llaman assertAdmin.
async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const roles = await getActorRoles(ctx);
  if (!roles.includes("admin")) throw new Error("Solo administradores pueden hacer esta acción.");
}


async function getActorEmail(supabaseAdmin: any, userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.email ?? null;
}

async function logAudit(
  supabaseAdmin: any,
  args: {
    actorUserId: string;
    actorEmail: string | null;
    targetUserId: string | null;
    targetEmail: string | null;
    action: string;
    details?: Record<string, unknown>;
  },
) {
  await supabaseAdmin.from("user_admin_audit").insert({
    actor_user_id: args.actorUserId,
    actor_email: args.actorEmail,
    target_user_id: args.targetUserId,
    target_email: args.targetEmail,
    action: args.action,
    details: args.details ?? {},
  });
}

async function countAdmins(supabaseAdmin: any): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("user_roles")
    .select("*", { count: "exact", head: true })
    .eq("role", "admin");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Impide que un no-admin toque a un usuario que es admin. */
async function assertCanTargetUser(supabaseAdmin: any, actorRoles: AppRole[], targetUserId: string) {
  if (actorRoles.includes("admin")) return;
  if (await userIsAdmin(supabaseAdmin, targetUserId)) {
    throw new Error("No puedes modificar a un administrador. Pide a un administrador que lo haga.");
  }
}

async function userIsAdmin(supabaseAdmin: any, userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

async function assertNotLastAdminRemoval(
  supabaseAdmin: any,
  targetUserId: string,
  newRoles: AppRole[],
) {
  const wasAdmin = await userIsAdmin(supabaseAdmin, targetUserId);
  const stillAdmin = newRoles.includes("admin");
  if (wasAdmin && !stillAdmin) {
    const admins = await countAdmins(supabaseAdmin);
    if (admins <= 1) {
      throw new Error("No puedes remover al último administrador del sistema.");
    }
  }
}

// =========================================================================
// CREATE
// =========================================================================

const createInput = z.object({
  email: z.string().email("Correo inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
  displayName: z.string().min(1, "Nombre requerido").max(120),
  roles: z.array(z.enum(APP_ROLES)).min(1, "Asigna al menos un rol"),
  brandIds: z.array(z.string().uuid()).default([]),
});

export const createUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createInput.parse(d))
  .handler(async ({ data, context }) => {
    const actorRoles = await assertCanManageUsers(context);
    assertRolesAllowedForActor(actorRoles, data.roles);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const actorEmail = await getActorEmail(supabaseAdmin, context.userId);

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.displayName },
    });
    if (createErr) throw new Error(createErr.message);
    const newUserId = created.user?.id;
    if (!newUserId) throw new Error("No se pudo crear el usuario.");

    await supabaseAdmin
      .from("profiles")
      .upsert(
        { user_id: newUserId, email: data.email, display_name: data.displayName },
        { onConflict: "user_id" },
      );

    if (data.roles.length > 0) {
      const rows = data.roles.map((role) => ({ user_id: newUserId, role }));
      const { error: roleErr } = await supabaseAdmin.from("user_roles").insert(rows);
      if (roleErr) throw new Error(`Usuario creado pero falló asignar roles: ${roleErr.message}`);
    }

    if (data.brandIds.length > 0) {
      const rows = data.brandIds.map((brand_id) => ({ user_id: newUserId, brand_id }));
      await supabaseAdmin.from("user_brands").insert(rows);
    }

    await logAudit(supabaseAdmin, {
      actorUserId: context.userId,
      actorEmail,
      targetUserId: newUserId,
      targetEmail: data.email,
      action: "user.create",
      details: { roles: data.roles, brandIds: data.brandIds },
    });

    return { userId: newUserId, email: data.email };
  });

// =========================================================================
// LIST
// =========================================================================

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actorRoles = await assertCanManageUsers(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id, email, display_name, created_at")
      .order("created_at", { ascending: false });
    if (pErr) throw new Error(pErr.message);

    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const { data: brandLinks } = await supabaseAdmin
      .from("user_brands")
      .select("user_id, brand_id");

    const rolesByUser = new Map<string, AppRole[]>();
    for (const r of roles ?? []) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role as AppRole);
      rolesByUser.set(r.user_id, arr);
    }
    const brandsByUser = new Map<string, string[]>();
    for (const b of brandLinks ?? []) {
      const arr = brandsByUser.get(b.user_id) ?? [];
      arr.push(b.brand_id);
      brandsByUser.set(b.user_id, arr);
    }

    // Fetch auth user metadata (last_sign_in_at, banned_until)
    const authMetaByUser = new Map<
      string,
      { last_sign_in_at: string | null; banned_until: string | null }
    >();
    let page = 1;
    const perPage = 200;
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) break;
      for (const u of data.users) {
        authMetaByUser.set(u.id, {
          last_sign_in_at: u.last_sign_in_at ?? null,
          banned_until: (u as any).banned_until ?? null,
        });
      }
      if (!data.users.length || data.users.length < perPage) break;
      page += 1;
      if (page > 20) break;
    }

    return (profiles ?? []).map((p) => {
      const meta = authMetaByUser.get(p.user_id);
      const banned_until = meta?.banned_until ?? null;
      const isSuspended =
        !!banned_until && new Date(banned_until).getTime() > Date.now();
      return {
        ...p,
        roles: rolesByUser.get(p.user_id) ?? [],
        brand_ids: brandsByUser.get(p.user_id) ?? [],
        last_sign_in_at: meta?.last_sign_in_at ?? null,
        banned_until,
        is_suspended: isSuspended,
      };
    });
  });

// =========================================================================
// LIST BRANDS (for assigning brand scope)
// =========================================================================

export const listBrandsForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actorRoles = await assertCanManageUsers(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("brands")
      .select("id, name, slug")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// =========================================================================
// UPDATE PROFILE (name + email)
// =========================================================================

const updateProfileInput = z.object({
  userId: z.string().uuid(),
  displayName: z.string().min(1).max(120),
  email: z.string().email(),
});

export const updateUserProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateProfileInput.parse(d))
  .handler(async ({ data, context }) => {
    const actorRoles = await assertCanManageUsers(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertCanTargetUser(supabaseAdmin, actorRoles, data.userId);
    const actorEmail = await getActorEmail(supabaseAdmin, context.userId);

    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email: data.email,
      user_metadata: { display_name: data.displayName },
    });
    if (authErr) throw new Error(authErr.message);

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({ email: data.email, display_name: data.displayName })
      .eq("user_id", data.userId);
    if (profErr) throw new Error(profErr.message);

    await logAudit(supabaseAdmin, {
      actorUserId: context.userId,
      actorEmail,
      targetUserId: data.userId,
      targetEmail: data.email,
      action: "user.update_profile",
      details: { displayName: data.displayName, email: data.email },
    });
    return { ok: true };
  });

// =========================================================================
// SET ROLES
// =========================================================================

const setRolesInput = z.object({
  userId: z.string().uuid(),
  roles: z.array(z.enum(APP_ROLES)),
});

export const setUserRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => setRolesInput.parse(d))
  .handler(async ({ data, context }) => {
    const actorRoles = await assertCanManageUsers(context);
    assertRolesAllowedForActor(actorRoles, data.roles);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertCanTargetUser(supabaseAdmin, actorRoles, data.userId);
    const actorEmail = await getActorEmail(supabaseAdmin, context.userId);

    if (data.userId === context.userId && !data.roles.includes("admin")) {
      throw new Error("No puedes quitarte el rol de administrador a ti mismo.");
    }
    await assertNotLastAdminRemoval(supabaseAdmin, data.userId, data.roles);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    if (data.roles.length > 0) {
      const rows = data.roles.map((role) => ({ user_id: data.userId, role }));
      const { error } = await supabaseAdmin.from("user_roles").insert(rows);
      if (error) throw new Error(error.message);
    }

    await logAudit(supabaseAdmin, {
      actorUserId: context.userId,
      actorEmail,
      targetUserId: data.userId,
      targetEmail: null,
      action: "user.set_roles",
      details: { roles: data.roles },
    });
    return { ok: true };
  });

// =========================================================================
// SET BRANDS
// =========================================================================

const setBrandsInput = z.object({
  userId: z.string().uuid(),
  brandIds: z.array(z.string().uuid()),
});

export const setUserBrands = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => setBrandsInput.parse(d))
  .handler(async ({ data, context }) => {
    const actorRoles = await assertCanManageUsers(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertCanTargetUser(supabaseAdmin, actorRoles, data.userId);
    const actorEmail = await getActorEmail(supabaseAdmin, context.userId);

    await supabaseAdmin.from("user_brands").delete().eq("user_id", data.userId);
    if (data.brandIds.length > 0) {
      const rows = data.brandIds.map((brand_id) => ({ user_id: data.userId, brand_id }));
      const { error } = await supabaseAdmin.from("user_brands").insert(rows);
      if (error) throw new Error(error.message);
    }

    await logAudit(supabaseAdmin, {
      actorUserId: context.userId,
      actorEmail,
      targetUserId: data.userId,
      targetEmail: null,
      action: "user.set_brands",
      details: { brandIds: data.brandIds },
    });
    return { ok: true };
  });

// =========================================================================
// RESET PASSWORD
// =========================================================================

const resetPasswordInput = z.object({
  userId: z.string().uuid(),
  newPassword: z.string().min(8),
});

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => resetPasswordInput.parse(d))
  .handler(async ({ data, context }) => {
    const actorRoles = await assertCanManageUsers(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertCanTargetUser(supabaseAdmin, actorRoles, data.userId);
    const actorEmail = await getActorEmail(supabaseAdmin, context.userId);

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);

    await logAudit(supabaseAdmin, {
      actorUserId: context.userId,
      actorEmail,
      targetUserId: data.userId,
      targetEmail: null,
      action: "user.reset_password",
    });
    return { ok: true };
  });

// =========================================================================
// SUSPEND / REACTIVATE
// =========================================================================

const suspendInput = z.object({
  userId: z.string().uuid(),
  suspend: z.boolean(),
});

export const setUserSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => suspendInput.parse(d))
  .handler(async ({ data, context }) => {
    const actorRoles = await assertCanManageUsers(context);
    if (data.userId === context.userId && data.suspend) {
      throw new Error("No puedes suspender tu propia cuenta.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertCanTargetUser(supabaseAdmin, actorRoles, data.userId);
    const actorEmail = await getActorEmail(supabaseAdmin, context.userId);

    if (data.suspend && (await userIsAdmin(supabaseAdmin, data.userId))) {
      const admins = await countAdmins(supabaseAdmin);
      if (admins <= 1) throw new Error("No puedes suspender al único administrador.");
    }

    const ban_duration = data.suspend ? "876000h" : "none"; // ~100 años o desactivar
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration,
    } as any);
    if (error) throw new Error(error.message);

    await logAudit(supabaseAdmin, {
      actorUserId: context.userId,
      actorEmail,
      targetUserId: data.userId,
      targetEmail: null,
      action: data.suspend ? "user.suspend" : "user.reactivate",
    });
    return { ok: true };
  });

// =========================================================================
// SIGN OUT (revoca sesiones)
// =========================================================================

const signOutInput = z.object({ userId: z.string().uuid() });

export const signOutUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => signOutInput.parse(d))
  .handler(async ({ data, context }) => {
    const actorRoles = await assertCanManageUsers(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const actorEmail = await getActorEmail(supabaseAdmin, context.userId);

    const { error } = await supabaseAdmin.auth.admin.signOut(data.userId);
    if (error) throw new Error(error.message);

    await logAudit(supabaseAdmin, {
      actorUserId: context.userId,
      actorEmail,
      targetUserId: data.userId,
      targetEmail: null,
      action: "user.sign_out",
    });
    return { ok: true };
  });

// =========================================================================
// DELETE
// =========================================================================

const deleteInput = z.object({
  userId: z.string().uuid(),
  confirmEmail: z.string().email(),
});

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const actorRoles = await assertCanManageUsers(context);
    if (data.userId === context.userId) {
      throw new Error("No puedes eliminar tu propia cuenta.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const actorEmail = await getActorEmail(supabaseAdmin, context.userId);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!profile) throw new Error("Usuario no encontrado.");
    if (profile.email?.toLowerCase() !== data.confirmEmail.toLowerCase()) {
      throw new Error("El correo de confirmación no coincide.");
    }
    if (await userIsAdmin(supabaseAdmin, data.userId)) {
      const admins = await countAdmins(supabaseAdmin);
      if (admins <= 1) throw new Error("No puedes eliminar al único administrador.");
    }

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("user_brands").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("profiles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);

    await logAudit(supabaseAdmin, {
      actorUserId: context.userId,
      actorEmail,
      targetUserId: data.userId,
      targetEmail: profile.email,
      action: "user.delete",
    });
    return { ok: true };
  });

// =========================================================================
// AUDIT LOG
// =========================================================================

export const listUserAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actorRoles = await assertCanManageUsers(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("user_admin_audit")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
