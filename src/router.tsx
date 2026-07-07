import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { routeTree } from "./routeTree.gen";

let lastAuthToastAt = 0;
function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /Unauthorized|No authorization header|Invalid token|JWT|refresh_token/i.test(msg);
}
function notifyAuthExpired(err: unknown) {
  if (!isAuthError(err)) return;
  const now = Date.now();
  if (now - lastAuthToastAt < 4000) return;
  lastAuthToastAt = now;
  toast.error("Tu sesión expiró, vuelve a iniciar sesión");
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: notifyAuthExpired }),
    mutationCache: new MutationCache({ onError: notifyAuthExpired }),
    defaultOptions: {
      queries: {
        // Cache data por 5 minutos para evitar refetch al navegar entre módulos
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        retry: (failureCount, err) => (isAuthError(err) ? false : failureCount < 1),
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 5 * 60_000,
  });

  return router;
};
