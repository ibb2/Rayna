import { Button } from '@/components/ui/button'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Clock, Heart, MoreVertical, Play, Plus } from 'lucide-react'

import noPlaylistCover from '../../assets/no-playlist-cover.png'
import { Spinner } from '@/components/ui/spinner'

export const Route = createFileRoute('/app/playlist/$ratingKey')({
  component: PlaylistPage
})

function PlaylistPage() {
  const { ratingKey } = Route.useParams()

  // queries
  const queryPlaylist = useQuery({
    queryKey: ['playlist', ratingKey],
    queryFn: () =>
      fetch(`http://127.0.0.1:8000/music/playlist/${Number(ratingKey)}`).then((res) => res.json())
  })

  if (queryPlaylist.isLoading) return <div className="flex items-center justify-center w-full h-full"><Spinner className='size-8' /></div>
  if (queryPlaylist.isError) return 'Error loading playlist' + queryPlaylist.error.message

  const playlist = queryPlaylist.data

  return (
    <div className="flex flex-col overflow-y-scroll p-6 mb-30">
      {/* playlist Header */}
      <div className="flex gap-6 mb-6">
        <img
          src={playlist.composite || noPlaylistCover}
          alt={playlist.title}
          className="w-48 h-48 rounded-lg shadow-xl"
        />
        <div className="flex flex-col justify-between py-2">
          <div>
            <div className="text-slate-600 dark:text-slate-100 text-sm mb-2 uppercase">
              playlist
            </div>
            <h1 className="text-4xl mb-3">{playlist.title}</h1>
            <div>{playlist.summary}</div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span>{dayjs(playlist.addedAt).format('YYYY')}</span>
            <span>•</span>
            <span>{playlist.leafCount} tracks</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-6">
        <Button className="px-8">
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
        <div className="grid grid-cols-[auto_auto_1fr_auto_auto] gap-4 px-4 py-2 text-sm border-b">
          <div className="w-8 text-center">#</div>
          <div></div>
          <div>Title</div>
          <div></div>
          <div className="w-16 text-right">
            <Clock size={14} className="inline" />
          </div>
        </div>

        {playlist.tracks.map((track: any, index: int) => (
          <div
            key={track.id}
            className="grid grid-cols-[auto_auto_1fr_auto_auto] gap-4 px-4 py-3 rounded group hover:bg-slate-200/50 transition-colors cursor-pointer"
          >
            <div className="text-center w-8 group-hover:hidden self-center">{index + 1}</div>
            <button className="hidden group-hover:block">
              <Play size={16} className="text-shadow-black w-8" fill="black" />
            </button>
            <img src={track.albumThumb} alt={track.albumTitle} className="w-12 rounded-lg" />
            <div>
              <div>{track.title}</div>
              <div className="flex flex-row items-center gap-2">
                <Link to={`/app/artist/${track.artistRatingKey}`}>
                  <div className="text-slate-400 text-sm hover:text-slate-700/50 hover:underline">
                    {track.artistTitle}
                  </div>
                </Link>
                <div className="pb-1 text-slate-400 ">{'  -  '}</div>
                <Link to={`/app/album/${track.albumRatingKey}`}>
                  <div className="text-slate-400 text-sm hover:text-slate-700/50 hover:underline">
                    {track.albumTitle}
                  </div>
                </Link>
              </div>
            </div>
            <button className="opacity-0 group-hover:opacity-100 transition-opacity">
              <Heart size={16} className="hover:text-red-400" />
            </button>
            <div className="text-zinc-400 text-sm text-right self-center">
              {dayjs.duration(track.duration).format('m:ss')}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
