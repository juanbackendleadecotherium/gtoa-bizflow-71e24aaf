import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/erp/real-production/")({
  beforeLoad: () => {
    throw redirect({ to: "/erp/real-production/produccion" });
  },
});
