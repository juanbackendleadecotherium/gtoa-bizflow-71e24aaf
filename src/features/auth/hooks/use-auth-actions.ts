import { supabase } from "@/integrations/supabase/client";
import type { SignInInput, SignUpInput } from "../schemas/auth-schemas";

export async function signIn(input: SignInInput) {
  const { data, error } = await supabase.auth.signInWithPassword(input);
  if (error) throw error;
  return data;
}

/**
 * Sign up + auto-login. Si la verificación por email está desactivada en Supabase,
 * signUp devuelve sesión directamente. Si no, hacemos fallback con signInWithPassword.
 */
export async function signUpAndLogin(input: SignUpInput) {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { display_name: input.displayName } },
  });
  if (error) throw error;

  if (data.session) return data;

  // Fallback: si confirm-email sigue activo, intentamos login (puede fallar
  // hasta que confirme el correo, en cuyo caso devolvemos un error claro).
  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
  if (signInError) {
    throw new Error(
      "Cuenta creada. Revisa tu correo para confirmar el acceso antes de iniciar sesión.",
    );
  }
  return signInData;
}
