import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type SessionState = {
  status: "loading" | "authenticated" | "unauthenticated";
  session: Session | null;
};

/**
 * Hook canónico de sesión: monta el listener ANTES de getSession()
 * para evitar perderse eventos tempranos (rule from docs).
 */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({
    status: "loading",
    session: null,
  });

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setState({
          status: session ? "authenticated" : "unauthenticated",
          session,
        });
      },
    );

    supabase.auth.getSession().then(({ data }) => {
      setState({
        status: data.session ? "authenticated" : "unauthenticated",
        session: data.session,
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  return state;
}
