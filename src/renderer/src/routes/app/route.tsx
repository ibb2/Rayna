import { AppSidebar } from '@/components/app-sidebar'
import { PlayerFooter } from '@/components/layout/PlayerFooter'
import { SiteHeader } from '@/components/site-header'
import { StartupLoading } from '@/components/StartupLoading'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app')({
  component: AppLayoutComponent
})

function AppLayoutComponent() {

  return (
    <StartupLoading>
      <div className="flex flex-col h-screen w-screen">
        <div className="flex-1 min-h-0 overflow-hidden relative">
          <SidebarProvider
            defaultOpen={false}
            className="[&_div[data-slot='sidebar-container']]:absolute! [&_div[data-slot='sidebar-container']]:h-full! [&_div[data-slot='sidebar-container']]:top-0! [&_div[data-slot='sidebar-container']]:bottom-0!"
          >
            <AppSidebar collapsible="icon" />
            <SidebarInset className="overflow-hidden h-screen">
              <SiteHeader />
              <Outlet />
            </SidebarInset>
          </SidebarProvider>
        </div>
        <PlayerFooter />
      </div>
    </StartupLoading>
  )
}
