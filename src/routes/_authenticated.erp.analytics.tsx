import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/erp/analytics")({
  head: () => ({ meta: [{ title: "Gráficas ERP — Grupo Getova" }] }),
  beforeLoad: ({ location }) => {
    if (location.pathname === "/erp/analytics" || location.pathname === "/erp/analytics/") {
      throw redirect({ to: "/erp/analytics/operations" });
    }
  },
  component: () => <Outlet />,
});
