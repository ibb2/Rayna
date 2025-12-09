import { createRootRoute, Outlet } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

// eslint-disable-next-line react-refresh/only-export-components
export const queryClient = new QueryClient()

export const Route = createRootRoute({
  component: () => (
    <div className="flex flex-1 flex-col overflow-hidden h-full">
      <QueryClientProvider client={queryClient}>
        <Outlet />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </div>
  )
})
