import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/playlist/$ratingKey')({
  component: PlaylistPage
})

function PlaylistPage() {
  const { ratingKey } = Route.useParams()
  return <div className="p-4">Playlist Page: {ratingKey}</div>
}
