import { createFileRoute, redirect } from '@tanstack/react-router'
import { ChartAreaInteractive } from '@/components/chart-area-interactive'
import { DataTable } from '@/components/data-table'
import { SectionCards } from '@/components/section-cards'
import data from '../data.json'
import { PlexServer } from '@/types'

export const Route = createFileRoute('/')({
  component: Index,
  beforeLoad: async () => {
    const isUserLoggedIn = await window.api.auth.isUserSignedIn()
    const hasUserSelectedAServer = await window.api.auth.isServerSelected()

    console.log('Is user logged in: ', isUserLoggedIn)

    if (!isUserLoggedIn) {
      throw redirect({
        to: '/auth'
      })
    } else {
      console.log('Has user selected a server: ', hasUserSelectedAServer)
      if (!hasUserSelectedAServer) {
        return redirect({
          to: '/server'
        })
      }

      let server: PlexServer | null = await window.api.auth.getUserSelectedServer()

      console.log("Server: ", server)

      if (server == null) {
        console.log("Server is null")
      return redirect({
            to: '/server'
          })
      }

      const accessToken = await window.api.auth.getUserAccessToken()
      console.log('serverUrl:', server.connections)

      const response = await fetch(`http://127.0.0.1:11222/init`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          serverUrl: server.connections[0].uri
        })
      })
      await response.json()

      return redirect({
        to: '/app'
      })
    }
  }
})

function Index() {
  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <h2 className="text-2xl font-bold tracking-tight">Recently Played</h2>
        <SectionCards />
        <div className="px-4 lg:px-6">
          <ChartAreaInteractive />
        </div>
        <h2 className="text-2xl font-bold tracking-tight mt-6">Your Library</h2>
        <DataTable data={data} />
      </div>
    </div>
  )
}
