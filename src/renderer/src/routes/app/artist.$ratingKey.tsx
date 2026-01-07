import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Heart, MoreVertical, Play } from 'lucide-react'

export const Route = createFileRoute('/app/artist/$ratingKey')({
  component: ArtistPage
})

export function ArtistPage() {
  const { ratingKey } = Route.useParams()

  // queries
  const queryArtist = useQuery({
    queryKey: ['artist', ratingKey],
    queryFn: () =>
      fetch(`http://127.0.0.1:11222/music/artist/${Number(ratingKey)}`).then((res) => {
        if (!res.ok) throw new Error('Network response was not ok')
        return res.json()
      })
  })
  const queryArtistAlbums = useQuery({
    queryKey: ['artistAlbum', ratingKey],
    queryFn: () =>
      fetch(`http://127.0.0.1:11222/music/artist/${Number(ratingKey)}/albums`).then((res) => {
        if (!res.ok) throw new Error('Network response was not ok')
        return res.json()
      })
  })
  const queryArtistPopularTracks = useQuery({
    queryKey: ['artistPopularTrack', ratingKey],
    queryFn: () =>
      fetch(`http://127.0.0.1:11222/music/artist/${Number(ratingKey)}/popular-tracks`).then(
        (res) => {
          if (!res.ok) throw new Error('Network response was not ok')
          return res.json()
        }
      )
  })

  if (queryArtistAlbums.isLoading || queryArtistPopularTracks.isLoading || queryArtist.isLoading)
    return 'Loading...'
  if (queryArtistPopularTracks.isError || queryArtistAlbums.isError || queryArtist.isError)
    return (
      'Error loading artist' + queryArtistPopularTracks.error?.message ||
      queryArtistAlbums.error?.message ||
      queryArtist.error?.message
    )

  return (
    <div className="flex flex-col overflow-y-scroll h-full p-6 mb-20">
      {/* Artist Header */}
      <div className="flex gap-6 mb-6">
        <img
          src={queryArtist.data.thumb}
          alt={queryArtist.data.title}
          className="w-48 h-48 rounded-full object-cover shadow-xl"
        />
        <div className="flex flex-col justify-between py-2">
          <div>
            {queryArtist.data.verified && (
              <div className="text-blue-400 text-sm mb-2">✓ VERIFIED ARTIST</div>
            )}
            <div className="text-blue-400 text-sm mb-2">✓ VERIFIED ARTIST</div>
            <h1 className="text-5xl font-bold mb-2">{queryArtist.data.title}</h1>
            {/*<div className="text-zinc-400">{queryArtist.data.followers} monthly listeners</div>*/}
            <div className="text-muted-foreground">{queryArtist.data.viewCount} plays</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-6">
        <Button className="px-8">
          <Play size={18} className="mr-2" fill="black" />
          Play
        </Button>
        <Button variant="outline">
          <Heart size={18} className="mr-2" />
          Follow
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-zinc-400 hover:text-white hover:bg-zinc-800"
        >
          <MoreVertical size={20} />
        </Button>
      </div>

      {/* Popular Tracks */}
      <div className="mb-8">
        <h2 className="text-2xl mb-4">Popular Tracks</h2>
        <div className="bg-slate-300/10 rounded-lg">
          {queryArtistPopularTracks.data.tracks.map((track: any, index: number) => (
            <div
              key={track.id}
              className="flex items-center gap-4 px-4 py-3 rounded group hover:bg-slate-200/50 transition-colors cursor-pointer"
            >
            <div className="text-center w-8 group-hover:hidden">{index + 1}</div>
            <button
              className="hidden group-hover:block"
              onClick={() => {
                fetch(`http://127.0.0.1:11222/music/play/track/${track.ratingKey}`)
              }}
            >
            <Play size={16} className="text-shadow-black w-8" fill="black" />
            </button>              
            <div className="flex-1">
                <div className="">{track.title}</div>
                <div className="text-zinc-400 text-sm">
                  {Intl.NumberFormat('en-US', {
                    notation: 'compact',
                    compactDisplay: 'short' // Use 'long' for "million" instead of "M"
                  }).format(track.ratingCount)}
                </div>
              </div>
              <div className="text-zinc-400 text-sm">
                {dayjs.duration(track.duration).format('m:ss')}
              </div>
              <button className="opacity-0 group-hover:opacity-100 transition-opacity">
                <Heart size={16} className="text-zinc-400 hover:text-white" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Albums */}
      <div>
        <h2 className="text-2xl mb-4">Albums</h2>
        <div className="flex flex-row gap-4">
          {queryArtistAlbums.data.map((album: any) => (
            <Link
              key={album.id}
              to={`/app/album/$ratingKey`}
              params={{ ratingKey: album.ratingKey }}
            >
              <Card key={album.id} className="flex p-4 justify-center min-w-36 h-48 shrink-0">
                <CardHeader className="p-0">
                  <img
                    src={album.thumb}
                    alt={album.title}
                    className="w-full object-cover rounded-lg"
                  />
                  <CardTitle className="overflow-hidden text-ellipsis text-nowrap">
                    {album.title}
                  </CardTitle>
                  <CardDescription>{album.year}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
