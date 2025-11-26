import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/artist/$artistId')({
    component: ArtistPage,
})

function ArtistPage() {
    const { artistId } = Route.useParams()
    return <div className="p-4">Artist Page: {artistId}</div>
}
