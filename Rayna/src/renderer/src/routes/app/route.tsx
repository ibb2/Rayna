import { AppSidebar } from '@/components/app-sidebar'
import { PlayerFooter } from '@/components/layout/PlayerFooter'
import { SiteHeader } from '@/components/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app')({
  component: AppLayoutComponent
})

function AppLayoutComponent() {
  return (
    <SidebarProvider>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <Outlet />
      </SidebarInset>
      <PlayerFooter />
    </SidebarProvider>
  )
}
