import { AppSidebar } from '@/components/app-sidebar'
import { SiteHeader } from '@/components/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app')({
    component: AppLayoutComponent,
})

function AppLayoutComponent() {
    return (
        <SidebarProvider
            style={
                {
                    '--sidebar-width': 'calc(var(--spacing) * 72)',
                    '--header-height': 'calc(var(--spacing) * 12)'
                } as React.CSSProperties
            }
        >
            <AppSidebar variant="inset" />
            <SidebarInset>
                <SiteHeader />
                <Outlet />
            </SidebarInset>
        </SidebarProvider >
    )
}