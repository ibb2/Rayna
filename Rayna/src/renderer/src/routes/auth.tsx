import { Button } from '@/components/ui/button';
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/auth')({
    component: Auth
})

function Auth() {
    return (
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4 items-center justify-items-center justify-center">
            <p>Auth</p>
            <Button>Login</Button>
        </div>
    )
}

export default Auth;
