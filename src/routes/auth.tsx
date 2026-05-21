import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acceso — Grupo GTOA" },
      { name: "description", content: "Iniciar sesión en el backoffice de Grupo GTOA." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const session = useSession();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session.status === "authenticated") {
      navigate({ to: "/erp" });
    }
  }, [session.status, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error("No se pudo iniciar sesión", { description: error.message });
    toast.success("Bienvenido");
    navigate({ to: "/erp" });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/erp`,
        data: { display_name: displayName },
      },
    });
    setLoading(false);
    if (error) return toast.error("No se pudo crear la cuenta", { description: error.message });
    toast.success("Cuenta creada", {
      description: "Revisa tu correo para confirmar el acceso si la verificación está activa.",
    });
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
            <h1 className="font-display text-2xl font-semibold">Backoffice Grupo GTOA</h1>
            <p className="text-sm text-muted-foreground mt-1">Acceso interno</p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")}>
              <TabsList className="grid grid-cols-2 w-full mb-6">
                <TabsTrigger value="signin">Iniciar sesión</TabsTrigger>
                <TabsTrigger value="signup">Crear cuenta</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email-in">Correo</Label>
                    <Input id="email-in" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@grupogtoa.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pass-in">Contraseña</Label>
                    <Input id="pass-in" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Entrar
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name-up">Nombre</Label>
                    <Input id="name-up" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Tu nombre" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-up">Correo</Label>
                    <Input id="email-up" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pass-up">Contraseña</Label>
                    <Input id="pass-up" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Crear cuenta
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
