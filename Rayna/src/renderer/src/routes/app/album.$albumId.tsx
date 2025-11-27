import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/album/$albumId')({
  component: AlbumPage
})

function AlbumPage() {
  const { albumId } = Route.useParams()
  return <div className="p-4">Album Page: {albumId}</div>
}
