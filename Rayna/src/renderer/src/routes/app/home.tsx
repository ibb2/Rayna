import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/home')({
    component: RouteComponent,
})

function RouteComponent() {
    return <div><p>Home</p></div>
}
