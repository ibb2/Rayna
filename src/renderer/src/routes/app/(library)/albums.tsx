import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/(library)/albums")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/app/(library)/albums"!</div>;
}
