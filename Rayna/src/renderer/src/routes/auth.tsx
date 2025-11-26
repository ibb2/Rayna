import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react';

export const Route = createFileRoute('/auth')({
    component: Auth
})

function Auth() {

    const [loading, setLoading] = useState(false)

    return (
        <div className="flex flex-1 flex-col gap-12 overflow-y-auto p-4 items-center justify-items-center justify-center h-full">
            <h1 className="scroll-m-20 text-center text-4xl !font-bold tracking-tight text-balance">
                Rayna for <span className='text-[#e5a00d] !font-bold'>Plex</span>
            </h1>
            {!loading &&
                <Button variant={"secondary"} className='w-1/2 max-w-1/2' onClick={() => setLoading(true)}>Sign in with Plex</Button>
            }
            {loading &&
                <div className='flex flex-col gap-4 items-center justify-items-center justify-center'>
                    <Spinner className="size-8" />
                    <div className='flex flex-col items-center'>
                        <h1 className='text-muted-foreground'>Waiting for Authentication</h1>
                        <p className='text-muted-foreground'>Please continue in browser</p>
                    </div>
                </div>
            }
        </div>
    )
}

export default Auth;
