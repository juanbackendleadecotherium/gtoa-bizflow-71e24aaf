import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/erp/customers")({
  component: CustomersLayout,
});

function CustomersLayout() {
  return <Outlet />;
}

