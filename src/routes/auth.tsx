import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

import { useSession } from "@/lib/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PasswordInput } from "@/features/auth/components/password-input";
import { PasswordStrength } from "@/features/auth/components/password-strength";
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
  const [tab, setTab] = useState<"signin" | "signup">("signin");

  // signin state
  const [siEmail, setSiEmail] = useState("");
  const [siPass, setSiPass] = useState("");
  const [siErrors, setSiErrors] = useState<Errors>({});

  // signup state
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

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="px-6 sm:px-10 py-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-display font-bold text-xl mb-4 shadow-lg shadow-primary/20">
              G
            </div>
            <h1 className="font-display text-2xl font-semibold">Backoffice Grupo Getova</h1>
            <p className="text-sm text-muted-foreground mt-1">Acceso interno</p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")}>
              <TabsList className="grid grid-cols-2 w-full mb-6">
                <TabsTrigger value="signin">Iniciar sesión</TabsTrigger>
                <TabsTrigger value="signup">Crear cuenta</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4" noValidate>
                  <div className="space-y-2">
                    <Label htmlFor="email-in">Correo</Label>
                    <Input
                      id="email-in"
                      type="email"
                      value={siEmail}
                      onChange={(e) => setSiEmail(e.target.value)}
                      placeholder="nombre@grupogetova.com"
                      aria-invalid={!!siErrors.email}
                    />
                    {siErrors.email && (
                      <p className="text-xs text-destructive">{siErrors.email}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pass-in">Contraseña</Label>
                    <PasswordInput
                      id="pass-in"
                      value={siPass}
                      onChange={(e) => setSiPass(e.target.value)}
                      aria-invalid={!!siErrors.password}
                    />
                    {siErrors.password && (
                      <p className="text-xs text-destructive">{siErrors.password}</p>
                    )}
                  </div>
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Entrar
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4" noValidate>
                  <div className="space-y-2">
                    <Label htmlFor="name-up">Nombre</Label>
                    <Input
                      id="name-up"
                      value={suName}
                      onChange={(e) => setSuName(e.target.value)}
                      placeholder="Tu nombre"
                      aria-invalid={!!suErrors.displayName}
                    />
                    {suErrors.displayName && (
                      <p className="text-xs text-destructive">{suErrors.displayName}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-up">Correo</Label>
                    <Input
                      id="email-up"
                      type="email"
                      value={suEmail}
                      onChange={(e) => setSuEmail(e.target.value)}
                      placeholder="nombre@grupogetova.com"
                      aria-invalid={!!suErrors.email}
                    />
                    {suErrors.email && (
                      <p className="text-xs text-destructive">{suErrors.email}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pass-up">Contraseña</Label>
                    <PasswordInput
                      id="pass-up"
                      value={suPass}
                      onChange={(e) => setSuPass(e.target.value)}
                      aria-invalid={!!suErrors.password}
                    />
                    <PasswordStrength value={suPass} />
                    {suErrors.password && (
                      <p className="text-xs text-destructive">{suErrors.password}</p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    disabled={loading || !canSignUp}
                    className="w-full"
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Crear cuenta y entrar
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Una vez creada, un administrador debe asignarte rol y marcas.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  );
}
