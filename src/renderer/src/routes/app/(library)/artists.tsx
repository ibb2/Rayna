import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/(library)/artists")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/app/(library)/artists"!</div>;
}
