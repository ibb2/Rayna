import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Play, Heart, Plus, MoreVertical, Clock } from 'lucide-react'

export const Route = createFileRoute('/app/album/$ratingKey')({
  component: AlbumPage
})

export function AlbumPage() {
  const { ratingKey } = Route.useParams()

  // queries
  const queryAlbum = useQuery({
    queryKey: ['album', ratingKey],
    queryFn: () =>
      fetch(`http://127.0.0.1:34567/music/album/${Number(ratingKey)}`).then((res) => {
        if (!res.ok) throw new Error('Network response was not ok')
        return res.json()
      })
  })

  if (queryAlbum.isLoading)
    return (
      <div className="flex items-center justify-center w-full h-full">
        <Spinner className="size-8" />
      </div>
    )
  if (queryAlbum.isError) return 'Error loading album' + queryAlbum.error.message

  const album = queryAlbum.data

  return (
    <div className="flex flex-col overflow-y-scroll p-6 mb-20">
      {/* Album Header */}
      <div className="flex gap-6 mb-6">
        <img src={album.thumb} alt={album.title} className="w-48 h-48 rounded-lg shadow-xl" />
        <div className="flex flex-col justify-between py-2">
          <div>
            <div className="text-slate-600 dark:text-slate-100 text-sm mb-2">ALBUM</div>
            <h1 className="text-5xl font-bold mb-3">{album.title}</h1>
            <Link
              to={`/app/artist/$ratingKey`}
              params={{ ratingKey: album.artistKey }}
              className="hover:text-slate-700/50 hover:underline text-lg"
            >
              {album.artist}
            </Link>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span>{album.year}</span>
            <span>•</span>
            <span>{album.leafCount} tracks</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          className="px-8"
          onClick={() => {
            fetch(`http://127.0.0.1:34567/music/play/album/${ratingKey}`)
          }}
        >
          <Play size={18} className="mr-2" fill={'white'} />
          Play
        </Button>
        <Button variant="outline" className="">
          <Heart size={18} className="mr-2" />
          Like
        </Button>
        <Button variant="ghost" size="icon">
          <Plus size={20} />
        </Button>
        <Button variant="ghost" size="icon">
          <MoreVertical size={20} />
        </Button>
      </div>

      {/* Track List */}
      <div className="bg-slate-300/10 rounded-lg">
        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-4 py-2 text-sm border-b">
          <div className="w-8 text-center">#</div>
          <div>Title</div>
          <div></div>
          <div className="w-16 text-right">
            <Clock size={14} className="inline" />
          </div>
        </div>

        {album.tracks.map((track: any, index: number) => (
          <div
            key={track.id}
            className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-4 py-3 rounded group hover:bg-slate-200/50 transition-colors cursor-pointer"
          >
            <div className="text-center w-8 group-hover:hidden">{index + 1}</div>
            <button
              className="hidden group-hover:block"
              onClick={() => {
                fetch(`http://127.0.0.1:34567/music/play/track/${track.ratingKey}`)
              }}
            >
              <Play size={16} className="text-shadow-black w-8" fill="black" />
            </button>
            <div>{track.title}</div>
            <button className="opacity-0 group-hover:opacity-100 transition-opacity">
              <Heart size={16} className="hover:text-red-400" />
            </button>
            <div className="text-sm w-16 text-right">
              {dayjs.duration(track.duration).format('m:ss')}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
