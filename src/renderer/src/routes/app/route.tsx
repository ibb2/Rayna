import { AppSidebar } from '@/components/app-sidebar'
import { PlayerFooter } from '@/components/layout/PlayerFooter'
import { SiteHeader } from '@/components/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app')({
  component: AppLayoutComponent
})

function AppLayoutComponent() {

  // const initializeFastApiBackend = async () => {
  //   let server: PlexServer | null = await window.api.auth.getUserSelectedServer()

  //   console.log("Server: ", server)

  //   if (server == null) {
  //     console.log("Server is null")
  //     navigate({
  //               to: '/server',
  //               replace: true,
  //               reloadDocument: true,
  //             })
  //     return
  //   }

  //   const accessToken = await window.api.auth.getUserAccessToken()
  //   console.log('serverUrl:', server.connections)

  //   const response = await fetch(`http://127.0.0.1:11222/init`, {
  //     method: 'POST',
  //     headers: {
  //       Authorization: `Bearer ${accessToken}`,
  //       'Content-Type': 'application/json'
  //     },
  //     body: JSON.stringify({
  //       serverUrl: server.connections[0].uri
  //     })
  //   })
  //   await response.json()
  //   onLoad(true)
  // }

  // useEffect(() => {
  //   if (!load) initializeFastApiBackend()
  // }, [load])

  return (
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
  )
}
