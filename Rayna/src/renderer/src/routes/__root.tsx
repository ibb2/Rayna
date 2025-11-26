import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { AppSidebar } from '@/components/app-sidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { PlayerFooter } from '@/components/layout/PlayerFooter'
import React from 'react'

export const Route = createRootRoute({
  component: () => (
    <SidebarProvider
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 72)',
          '--header-height': 'calc(var(--spacing) * 12)'
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset className="pb-24">
        <TopBar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
      </SidebarInset>
      <PlayerFooter />
      <TanStackRouterDevtools />
    </SidebarProvider>
  )
})
