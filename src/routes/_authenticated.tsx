import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { useSession } from "@/lib/use-session";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const session = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (session.status === "unauthenticated") {
      navigate({ to: "/auth" });
    }
  }, [session.status, navigate]);

  if (session.status !== "authenticated") {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-muted-foreground">
        <div className="flex items-center gap-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando sesión…
        </div>
      </div>
    );
  }

  return <Outlet />;
}
