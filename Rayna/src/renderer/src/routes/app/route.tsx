import { AppSidebar } from '@/components/app-sidebar'
import { PlayerFooter } from '@/components/layout/PlayerFooter'
import { SiteHeader } from '@/components/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { PlexServer } from '@/types'
import { Outlet, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/app')({
  component: AppLayoutComponent
})

function AppLayoutComponent() {
  const [load, onLoad] = useState(false)

  const initializeFastApiBackend = async () => {
    const server: PlexServer = await window.api.auth.getUserSelectedServer()
    const accessToken = await window.api.auth.getUserAccessToken()
    console.log('serverUrl:', server.connections)

    const response = await fetch(`http://127.0.0.1:8000/init`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        serverUrl: server.connections[0].uri
      })
    })
    const res = await response.json()
  }

  useEffect(() => {
    if (!load) initializeFastApiBackend()
  }, [load])

  return (
    <div className="flex flex-col h-screen w-screen">
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <SidebarProvider className="[&_div[data-slot='sidebar-container']]:absolute! [&_div[data-slot='sidebar-container']]:h-full! [&_div[data-slot='sidebar-container']]:top-0! [&_div[data-slot='sidebar-container']]:bottom-0!">
          <AppSidebar variant="inset" collapsible="icon" />
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
