import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2, ShieldCheck, Sparkles } from "lucide-react";

import { useSession } from "@/lib/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/features/auth/components/password-input";
import { PasswordStrength } from "@/features/auth/components/password-strength";
import { CanvasRevealEffect } from "@/components/ui/canvas-reveal-effect";
import { cn } from "@/lib/utils";
import {
  MIN_PASSWORD_SCORE,
  scorePassword,
  signInSchema,
  signUpSchema,
} from "@/features/auth/schemas/auth-schemas";
import { signIn, signUpAndLogin } from "@/features/auth/hooks/use-auth-actions";

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
type Tab = "signin" | "signup";

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

function AuthPage() {
  const navigate = useNavigate();
  const session = useSession();
  const [tab, setTab] = useState<Tab>("signin");

  // signin
  const [siEmail, setSiEmail] = useState("");
  const [siPass, setSiPass] = useState("");
  const [siErrors, setSiErrors] = useState<Errors>({});

  // signup
  const [suName, setSuName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPass, setSuPass] = useState("");
  const [suErrors, setSuErrors] = useState<Errors>({});

  const [loading, setLoading] = useState(false);

  const suScore = useMemo(() => scorePassword(suPass).score, [suPass]);
  const canSignUp =
    suName.trim().length > 0 &&
    suEmail.trim().length > 0 &&
    suPass.length >= 8 &&
    suScore >= MIN_PASSWORD_SCORE;

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

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = signUpSchema.safeParse({
      displayName: suName,
      email: suEmail,
      password: suPass,
    });
    if (!parsed.success) {
      setSuErrors(fieldErrors(parsed.error));
      return;
    }
    setSuErrors({});
    setLoading(true);
    try {
      await signUpAndLogin(parsed.data);
      toast.success("Cuenta creada", { description: "Entrando al backoffice…" });
      navigate({ to: "/erp" });
    } catch (err) {
      toast.error("No se pudo crear la cuenta", {
        description: err instanceof Error ? err.message : "Intenta de nuevo",
      });
    } finally {
      setLoading(false);
    }
  };

  // Color de los dots: ámbar/cobre de la marca + acento sutil
  const dotColors = useMemo(
    () => [
      [230, 150, 40],   // ámbar Getova
      [255, 196, 110],  // ámbar claro
      [120, 80, 30],    // cobre oscuro
    ],
    [],
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0b10] text-white">
      {/* Fondo animado de dots */}
      <div className="absolute inset-0">
        <CanvasRevealEffect
          animationSpeed={3}
          colors={dotColors}
          opacities={[0.2, 0.2, 0.3, 0.4, 0.5, 0.7, 0.9, 1]}
          totalSize={5}
          dotSize={2}
          containerClassName="bg-[#0a0b10]"
          showGradient={false}
        />
        {/* Capas de gradiente para dar profundidad */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(230,150,40,0.18),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(20,30,60,0.7),transparent_60%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/70" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
        <div className="flex items-center gap-2 text-sm text-white/60">
          <ShieldCheck className="h-4 w-4 text-amber-400" />
          Acceso interno · Grupo Getova
        </div>
      </header>

      {/* Layout principal */}
      <main className="relative z-10 mx-auto flex max-w-6xl flex-col lg:flex-row items-stretch justify-center px-6 lg:px-10 pb-16 pt-4 gap-10 lg:gap-16">
        {/* Panel izquierdo — Branding */}
        <section className="flex-1 hidden lg:flex flex-col justify-between max-w-xl">
          <div>
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-black font-display font-bold text-xl shadow-lg shadow-amber-500/30">
              G
            </div>
            <h1 className="font-display text-5xl xl:text-6xl font-semibold leading-[1.05] mt-8 tracking-tight">
              Bienvenido al
              <br />
              <span className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-600 bg-clip-text text-transparent">
                Backoffice
              </span>
            </h1>
            <p className="mt-6 text-white/70 text-lg max-w-md leading-relaxed">
              Orquesta marcas, pedidos, finanzas y producción desde un solo lugar.
              Acceso exclusivo para el equipo de Grupo Getova.
            </p>
          </div>

          <ul className="mt-10 space-y-3 text-sm text-white/70">
            {[
              "ERP, CRM y producción unificados",
              "Gestión multimarca con permisos finos",
              "Trazabilidad completa de cada operación",
            ].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-400/15 text-amber-300">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </section>

        {/* Panel derecho — Formulario */}
        <section className="flex-1 max-w-md w-full mx-auto lg:mx-0 self-center">
          <div className="relative rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 sm:p-8 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
            {/* Logo mobile */}
            <div className="lg:hidden flex items-center gap-3 mb-6">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-black font-display font-bold">
                G
              </div>
              <div>
                <p className="font-display text-base font-semibold">Grupo Getova</p>
                <p className="text-xs text-white/60">Backoffice</p>
              </div>
            </div>

            {/* Tabs custom */}
            <div className="relative grid grid-cols-2 rounded-full bg-white/5 border border-white/10 p-1 mb-6">
              {(["signin", "signup"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "relative z-10 rounded-full py-2 text-sm font-medium transition-colors",
                    tab === t ? "text-black" : "text-white/70 hover:text-white",
                  )}
                >
                  {tab === t && (
                    <motion.span
                      layoutId="auth-tab-pill"
                      className="absolute inset-0 -z-10 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 shadow-md shadow-amber-500/30"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  {t === "signin" ? "Iniciar sesión" : "Crear cuenta"}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {tab === "signin" ? (
                <motion.form
                  key="signin"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25 }}
                  onSubmit={handleSignIn}
                  className="space-y-4"
                  noValidate
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="email-in" className="text-white/80">Correo</Label>
                    <Input
                      id="email-in"
                      type="email"
                      value={siEmail}
                      onChange={(e) => setSiEmail(e.target.value)}
                      placeholder="nombre@grupogetova.com"
                      aria-invalid={!!siErrors.email}
                      className="h-11 rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/40 focus-visible:ring-amber-400/60"
                    />
                    {siErrors.email && (
                      <p className="text-xs text-red-300">{siErrors.email}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pass-in" className="text-white/80">Contraseña</Label>
                    <PasswordInput
                      id="pass-in"
                      value={siPass}
                      onChange={(e) => setSiPass(e.target.value)}
                      aria-invalid={!!siErrors.password}
                      className="h-11 rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/40 focus-visible:ring-amber-400/60"
                    />
                    {siErrors.password && (
                      <p className="text-xs text-red-300">{siErrors.password}</p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="group w-full h-11 rounded-xl bg-gradient-to-r from-amber-300 to-amber-500 text-black hover:from-amber-200 hover:to-amber-400 shadow-lg shadow-amber-500/20 font-medium"
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Entrar
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                  <p className="text-xs text-white/50 text-center pt-1">
                    ¿No tienes acceso? Solicítalo a un administrador.
                  </p>
                </motion.form>
              ) : (
                <motion.form
                  key="signup"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25 }}
                  onSubmit={handleSignUp}
                  className="space-y-4"
                  noValidate
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="name-up" className="text-white/80">Nombre</Label>
                    <Input
                      id="name-up"
                      value={suName}
                      onChange={(e) => setSuName(e.target.value)}
                      placeholder="Tu nombre"
                      aria-invalid={!!suErrors.displayName}
                      className="h-11 rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/40 focus-visible:ring-amber-400/60"
                    />
                    {suErrors.displayName && (
                      <p className="text-xs text-red-300">{suErrors.displayName}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email-up" className="text-white/80">Correo</Label>
                    <Input
                      id="email-up"
                      type="email"
                      value={suEmail}
                      onChange={(e) => setSuEmail(e.target.value)}
                      placeholder="nombre@grupogetova.com"
                      aria-invalid={!!suErrors.email}
                      className="h-11 rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/40 focus-visible:ring-amber-400/60"
                    />
                    {suErrors.email && (
                      <p className="text-xs text-red-300">{suErrors.email}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pass-up" className="text-white/80">Contraseña</Label>
                    <PasswordInput
                      id="pass-up"
                      value={suPass}
                      onChange={(e) => setSuPass(e.target.value)}
                      aria-invalid={!!suErrors.password}
                      className="h-11 rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/40 focus-visible:ring-amber-400/60"
                    />
                    <PasswordStrength value={suPass} />
                    {suErrors.password && (
                      <p className="text-xs text-red-300">{suErrors.password}</p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    disabled={loading || !canSignUp}
                    className="group w-full h-11 rounded-xl bg-gradient-to-r from-amber-300 to-amber-500 text-black hover:from-amber-200 hover:to-amber-400 shadow-lg shadow-amber-500/20 font-medium disabled:opacity-50"
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Crear cuenta y entrar
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                  <p className="text-xs text-white/50 text-center pt-1">
                    Una vez creada, un administrador asignará rol y marcas.
                  </p>
                </motion.form>
              )}
            </AnimatePresence>
          </div>

          <p className="mt-6 text-center text-xs text-white/40">
            © {new Date().getFullYear()} Grupo Getova. Todos los derechos reservados.
          </p>
        </section>
      </main>
    </div>
  );
}
