import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <div className="flex flex-1 flex-col overflow-hidden h-full">
      <Outlet />
    </div>
  )
})
