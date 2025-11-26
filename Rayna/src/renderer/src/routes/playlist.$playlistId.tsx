import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/playlist/$playlistId')({
    component: PlaylistPage,
})

function PlaylistPage() {
    const { playlistId } = Route.useParams()
    return <div className="p-4">Playlist Page: {playlistId}</div>
}
