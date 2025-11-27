import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/')({
  component: Home
})

export default function Home() {
  return (
    <div className="flex flex-col h-full w-full">
      <p>Home</p>
    </div>
  )
}
