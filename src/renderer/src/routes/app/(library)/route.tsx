import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/(library)")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/app/(library)"!</div>;
}
