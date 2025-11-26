import { createFileRoute, redirect } from '@tanstack/react-router'
import { ChartAreaInteractive } from '@/components/chart-area-interactive'
import { DataTable } from '@/components/data-table'
import { SectionCards } from '@/components/section-cards'
import data from '../data.json'

export const Route = createFileRoute('/')({
  component: Index,
  beforeLoad: () => {
    throw redirect({
      to: '/auth'
    })
  },
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
