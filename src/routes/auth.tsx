import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";

import { useSession } from "@/lib/use-session";
import { Button } from "@/components/ui/button";
import { SmokeyBackground } from "@/components/ui/smokey-background";
import { cn } from "@/lib/utils";
import { signInSchema } from "@/features/auth/schemas/auth-schemas";
import { signIn } from "@/features/auth/hooks/use-auth-actions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acceso — Grupo Getova" },
      { name: "description", content: "Iniciar sesión en el backoffice de Grupo Getova." },
    ],
  }),
  component: AuthPage,
});

type Errors = Record<string, string>;

function fieldErrors(parseError: unknown): Errors {
  const out: Errors = {};
  if (parseError && typeof parseError === "object" && "issues" in parseError) {
    for (const issue of (parseError as { issues: { path: (string | number)[]; message: string }[] }).issues) {
      const key = String(issue.path[0] ?? "_");
      if (!out[key]) out[key] = issue.message;
    }
  }
  return out;
}

function FloatingField({
  id, type, value, onChange, label, icon, autoComplete, invalid,
}: {
  id: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  label: string;
  icon: React.ReactNode;
  autoComplete?: string;
  invalid?: boolean;
}) {
  const filled = value.length > 0;
  const isPassword = type === "password";
  const [show, setShow] = useState(false);
  const effectiveType = isPassword ? (show ? "text" : "password") : type;
  return (
    <div className="relative">
      <input
        id={id}
        type={effectiveType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={invalid}
        placeholder=" "
        className={cn(
          "peer w-full h-12 rounded-xl bg-white/5 border border-white/10",
          "px-11 pt-4 pb-1 text-white placeholder-transparent",
          isPassword && "pr-11",
          "focus:outline-none focus:border-amber-400/60 focus:bg-white/[0.07]",
          "transition-colors",
          invalid && "border-red-400/60",
        )}
      />
      <label
        htmlFor={id}
        className={cn(
          "pointer-events-none absolute left-11 text-white/50 transition-all duration-200",
          "top-1/2 -translate-y-1/2 text-sm",
          "peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:uppercase peer-focus:tracking-wider peer-focus:text-amber-300",
          filled &&
            "top-2 translate-y-0 text-[10px] uppercase tracking-wider text-amber-300/80",
        )}
      >
        {label}
      </label>
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40 peer-focus:text-amber-300">
        {icon}
      </span>
      {isPassword && (
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          tabIndex={-1}
          aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-amber-300 transition-colors p-1"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const session = useSession();

  const [siEmail, setSiEmail] = useState("");
  const [siPass, setSiPass] = useState("");
  const [siErrors, setSiErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session.status === "authenticated") {
      navigate({ to: "/erp" });
    }
  }, [session.status, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = signInSchema.safeParse({ email: siEmail, password: siPass });
    if (!parsed.success) {
      setSiErrors(fieldErrors(parsed.error));
      return;
    }
    setSiErrors({});
    setLoading(true);
    try {
      await signIn(parsed.data);
      toast.success("Bienvenido");
      navigate({ to: "/erp" });
    } catch (err) {
      toast.error("No se pudo iniciar sesión", {
        description: err instanceof Error ? err.message : "Intenta de nuevo",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#08090f] text-white">
      <SmokeyBackground color="#E6962A" backdropBlurAmount="sm" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/70 pointer-events-none" />

      <header className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
        <div className="hidden sm:flex items-center gap-2 text-xs text-white/50 uppercase tracking-widest">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(230,150,40,0.8)]" />
          Backoffice · Grupo Getova
        </div>
      </header>

      <main className="relative z-10 flex items-center justify-center px-6 pb-16 pt-2 min-h-[calc(100vh-100px)]">
        <div className="w-full max-w-md">
          <div className="relative rounded-3xl border border-white/15 bg-white/[0.06] backdrop-blur-2xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] p-7 sm:p-9">
            <div className="flex flex-col items-center text-center mb-7">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-600 text-black font-display font-bold text-2xl shadow-lg shadow-amber-500/40">
                G
              </div>
              <h1 className="font-display text-2xl font-semibold mt-4">
                Bienvenido de nuevo
              </h1>
              <p className="text-sm text-white/60 mt-1">
                Inicia sesión para continuar
              </p>
            </div>

            <motion.form
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              onSubmit={handleSignIn}
              className="space-y-4"
              noValidate
            >
              <FloatingField
                id="email-in"
                type="email"
                value={siEmail}
                onChange={setSiEmail}
                label="Correo electrónico"
                icon={<Mail className="h-4 w-4" />}
                autoComplete="email"
                invalid={!!siErrors.email}
              />
              {siErrors.email && (
                <p className="text-xs text-red-300 -mt-2 pl-2">{siErrors.email}</p>
              )}

              <FloatingField
                id="pass-in"
                type="password"
                value={siPass}
                onChange={setSiPass}
                label="Contraseña"
                icon={<Lock className="h-4 w-4" />}
                autoComplete="current-password"
                invalid={!!siErrors.password}
              />
              {siErrors.password && (
                <p className="text-xs text-red-300 -mt-2 pl-2">{siErrors.password}</p>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="group w-full h-12 rounded-xl bg-gradient-to-r from-amber-300 to-amber-500 text-black hover:from-amber-200 hover:to-amber-400 shadow-lg shadow-amber-500/25 font-medium"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Iniciar sesión
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>

              <p className="text-xs text-white/50 text-center pt-2">
                ¿Necesitas una cuenta? Solo un administrador puede crearla desde el panel interno.
              </p>
            </motion.form>
          </div>

          <p className="mt-6 text-center text-xs text-white/40">
            © {new Date().getFullYear()} Grupo Getova · Acceso interno
          </p>
        </div>
      </main>
    </div>
  );
}
