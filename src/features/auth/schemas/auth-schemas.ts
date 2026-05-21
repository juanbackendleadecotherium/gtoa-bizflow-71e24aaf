import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .min(1, "El correo es requerido")
  .email("Correo inválido")
  .max(255);

export const passwordCriteria = [
  { id: "length", label: "Al menos 8 caracteres", test: (v: string) => v.length >= 8 },
  { id: "lower", label: "Una letra minúscula", test: (v: string) => /[a-z]/.test(v) },
  { id: "upper", label: "Una letra mayúscula", test: (v: string) => /[A-Z]/.test(v) },
  { id: "number", label: "Un número", test: (v: string) => /\d/.test(v) },
  { id: "symbol", label: "Un símbolo", test: (v: string) => /[^A-Za-z0-9]/.test(v) },
] as const;

export function scorePassword(value: string) {
  const passed = passwordCriteria.filter((c) => c.test(value));
  return { score: passed.length, total: passwordCriteria.length, passed };
}

export const MIN_PASSWORD_SCORE = 3;

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "La contraseña es requerida"),
});

export const signUpSchema = z.object({
  displayName: z.string().trim().min(1, "El nombre es requerido").max(120),
  email: emailSchema,
  password: z
    .string()
    .min(8, "Mínimo 8 caracteres")
    .refine((v) => scorePassword(v).score >= MIN_PASSWORD_SCORE, {
      message: `La contraseña debe cumplir al menos ${MIN_PASSWORD_SCORE} criterios`,
    }),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
