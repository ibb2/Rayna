import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/library")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Outlet />
    </div>
  );
}
