import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/libraries')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/libraries"!</div>
}
