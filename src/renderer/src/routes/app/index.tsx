import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Item, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item'

import noPlaylistCover from '../../assets/no-playlist-cover.png'
import { Spinner } from '@/components/ui/spinner'
import { useRef } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'

dayjs.extend(duration)
dayjs.extend(relativeTime)

export const Route = createFileRoute('/app/')({
  component: Home
})

export default function Home() {
  // Refs for the scrollable containers
  const recentRef = useRef<HTMLDivElement>(null)
  const addedRef = useRef<HTMLDivElement>(null)
  const recommendedRef = useRef<HTMLDivElement>(null)

  const scroll = (ref: React.RefObject<HTMLDivElement | null>, direction: 'left' | 'right') => {
    if (!ref.current) {
      console.log('Ref is null')
      return
    }

    const scrollAmount = 300 // width of ~2 cards
    const scrollLeft = direction === 'left' ? -scrollAmount : scrollAmount

    console.log('Scrolling:', direction, 'Current scrollLeft:', ref.current.scrollLeft)

    ref.current.scrollBy({
      left: scrollLeft,
      behavior: 'smooth'
    })
  }

  // queries
  const queryTopEight = useQuery({
    queryKey: ['top-eight'],
    queryFn: () =>
      fetch('http://127.0.0.1:34567/music/library/top-eight').then((res) => {
        if (!res.ok) throw new Error('Network response was not ok')
        return res.json()
      }),
    staleTime: 30 * 60 * 1000,
    retry: true
  })

  const queryRecentlyPlayedAlbums = useQuery({
    queryKey: ['albums'],
    queryFn: () =>
      fetch('http://127.0.0.1:34567/music/albums/recently-played').then((res) => {
        if (!res.ok) throw new Error('Network response was not ok')
        return res.json()
      }),
    staleTime: 30 * 60 * 1000
  })

  const queryRecentlyAddedAlbums = useQuery({
    queryKey: ['album'],
    queryFn: () =>
      fetch('http://127.0.0.1:34567/music/albums/recently-added').then((res) => {
        if (!res.ok) throw new Error('Network response was not ok')
        return res.json()
      }),
    staleTime: 30 * 60 * 1000
  })

  const queryAllPlaylists = useQuery({
    queryKey: ['playlist'],
    queryFn: () =>
      fetch('http://127.0.0.1:34567/music/playlists/all').then((res) => {
        if (!res.ok) throw new Error('Network response was not ok')
        return res.json()
      }),
    staleTime: 30 * 60 * 1000
  })

  if (
    queryRecentlyAddedAlbums.isLoading ||
    queryRecentlyPlayedAlbums.isLoading ||
    queryAllPlaylists.isLoading ||
    queryTopEight.isLoading
  )
    return (
      <div className="flex items-center justify-center w-full h-full">
        <Spinner className="size-8" />
      </div>
    )
  if (
    queryRecentlyAddedAlbums.isError ||
    queryRecentlyPlayedAlbums.isError ||
    queryAllPlaylists.isError ||
    queryTopEight.isError
  )
    return (
      'An error has occurred: ' + queryRecentlyAddedAlbums.error?.message ||
      queryRecentlyPlayedAlbums.error?.message ||
      queryAllPlaylists.error?.message ||
      queryTopEight.error?.message
    )

  return (
    <div className="flex flex-col overflow-y-scroll scrollbar-hidden gap-2 p-6 mb-20">
      {/* Quick Access Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-1 mb-8 w-full">
        {queryTopEight.data.map((x) => (
          <Link
            key={x.id}
            to={x.type === 'album' ? `/app/album/$ratingKey` : `/app/playlist/$ratingKey`}
            params={{ ratingKey: x.ratingKey }}
          >
            <Item
              variant={'muted'}
              className="flex flex-row hover:bg-slate-300/40 overflow-hidden p-0"
            >
              <ItemMedia className="rounded-l-md rounded-r-none">
                <img src={x.thumb} alt={x.title} className="w-13 object-cover" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{x.title}</ItemTitle>
              </ItemContent>
            </Item>
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-12">
        {/* Recently Played */}
        <div>
          <h2 className="text-2xl mb-4 font-semibold">Recently Played</h2>

          {/* Wrapper - relative positioning context */}
          <div className="relative group">
            {/* Scrollable container */}
            <div
              ref={recentRef}
              className="flex flex-row overflow-x-auto overflow-y-hidden -ml-2 scrollbar-hidden scroll-smooth gap-4 px-2"
            >
              {queryRecentlyPlayedAlbums.data?.map((album) => (
                <Link
                  key={album.id}
                  to={`/app/album/$ratingKey`}
                  params={{ ratingKey: album.ratingKey }}
                >
                  <Card className="flex justify-center min-w-40 shrink-0 border-0 shadow-none hover:bg-zinc-100 dark:hover:bg-zinc-800/30 dark:bg-transparent p-2 rounded-md">
                    <CardHeader className="p-0">
                      <img
                        src={album.thumb}
                        alt={album.title}
                        className="w-full object-cover rounded-lg aspect-square"
                      />
                      <CardTitle className="overflow-hidden text-ellipsis text-nowrap text-sm">
                        {album.title}
                      </CardTitle>
                      <CardDescription className="text-xs">{album.artist}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>

            {/* Buttons OUTSIDE the scrolling div but INSIDE relative wrapper */}
            <button
              className="absolute left-2 top-2/5 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-black/50 dark:bg-neutral-800/90 hover:bg-black/70 dark:hover:bg-neutral-900/90 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer"
              onClick={() => scroll(recentRef, 'left')}
              aria-label="Scroll left"
            >
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <button
              className="absolute right-2 top-2/5 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-black/50 dark:bg-neutral-800/90 hover:bg-black/70 dark:hover:bg-neutral-900/90 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer"
              onClick={() => scroll(recentRef, 'right')}
              aria-label="Scroll right"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Recently Added - Same Pattern */}
        <div>
          <h2 className="text-2xl font-semibold mb-4">Recently Added</h2>
          <div className="relative group">
            <div
              ref={addedRef}
              className="flex flex-row overflow-x-auto overflow-y-hidden -ml-2 scrollbar-hidden scroll-smooth gap-4 px-2"
            >
              {queryRecentlyAddedAlbums.data?.map((album) => (
                <Link
                  key={album.id}
                  to={`/app/album/$ratingKey`}
                  params={{ ratingKey: album.ratingKey }}
                >
                  <Card className="flex justify-center min-w-40 shrink-0 border-0 shadow-none hover:bg-zinc-100 dark:hover:bg-zinc-800/30 dark:bg-transparent p-2 rounded-md">
                    <CardHeader className="p-0">
                      <img
                        src={album.thumb}
                        alt={album.title}
                        className="w-full object-cover rounded-lg aspect-square"
                      />
                      <CardTitle className="overflow-hidden text-ellipsis text-nowrap text-sm">
                        {album.title}
                      </CardTitle>
                      <CardDescription className="text-xs">{album.artist}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>

            <button
              className="absolute left-2 top-2/5 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-black/50 dark:bg-neutral-800/90 hover:bg-black/70 dark:hover:bg-neutral-900/90 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer"
              onClick={() => scroll(addedRef, 'left')}
            >
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <button
              className="absolute right-2 top-2/5 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-black/50 dark:bg-neutral-800/90 hover:bg-black/70 dark:hover:bg-neutral-900/90 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer"
              onClick={() => scroll(addedRef, 'right')}
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Recommended - Same Pattern */}
        <div>
          <h2 className="text-2xl font-semibold mb-4">Recommended for You</h2>
          <div className="relative group">
            <div
              ref={recommendedRef}
              className="flex flex-row overflow-x-auto overflow-y-hidden -ml-2 scrollbar-hidden scroll-smooth gap-4 px-2"
            >
              {queryAllPlaylists.data.map((playlist) => (
                <Link
                  key={playlist.id}
                  to={`/app/playlist/$ratingKey`}
                  params={{ ratingKey: playlist.ratingKey }}
                >
                  <Card className="flex justify-center min-w-40 shrink-0 border-0 shadow-none hover:bg-zinc-100 dark:hover:bg-zinc-800/30 dark:bg-transparent p-2 rounded-md">
                    <CardHeader className="p-0">
                      <img
                        src={playlist.composite || noPlaylistCover}
                        alt={playlist.title}
                        className="w-full object-cover rounded-lg aspect-square"
                      />
                      <CardTitle className="overflow-hidden text-ellipsis text-nowrap text-sm">
                        {playlist.title}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {playlist.duration
                          ? `${dayjs.duration(playlist.duration).hours()}hr ${dayjs.duration(playlist.duration).minutes()}min`
                          : '0hr 0min'}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>

            <button
              className="absolute left-2 top-2/5 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-black/50 dark:bg-neutral-800/90 hover:bg-black/70 dark:hover:bg-neutral-900/90 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer"
              onClick={() => scroll(recommendedRef, 'left')}
            >
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <button
              className="absolute right-2 top-2/5 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-black/50 dark:bg-neutral-800/90 hover:bg-black/70 dark:hover:bg-neutral-900/90 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer"
              onClick={() => scroll(recommendedRef, 'right')}
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
