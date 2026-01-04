import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Item, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item'

import noPlaylistCover from '../../assets/no-playlist-cover.png'
import { Spinner } from '@/components/ui/spinner'

dayjs.extend(duration)
dayjs.extend(relativeTime)

export const Route = createFileRoute('/app/')({
  component: Home
})

export default function Home() {
  // queries
  const queryTopEight = useQuery({
    queryKey: ['top-eight'],
    queryFn: () =>
      fetch('http://127.0.0.1:11222/music/library/top-eight').then((res) => {
        if (!res.ok) throw new Error('Network response was not ok')
        return res.json()
      }),
    staleTime: 30 * 60 * 1000,
    retry: true
  })

  const queryRecentlyPlayedAlbums = useQuery({
    queryKey: ['albums'],
    queryFn: () =>
      fetch('http://127.0.0.1:11222/music/albums/recently-played').then((res) => {
        if (!res.ok) throw new Error('Network response was not ok')
        return res.json()
      }),
    staleTime: 30 * 60 * 1000
  })

  const queryRecentlyAddedAlbums = useQuery({
    queryKey: ['album'],
    queryFn: () =>
      fetch('http://127.0.0.1:11222/music/albums/recently-added').then((res) => {
        if (!res.ok) throw new Error('Network response was not ok')
        return res.json()
      }),
    staleTime: 30 * 60 * 1000
  })

  const queryAllPlaylists = useQuery({
    queryKey: ['playlist'],
    queryFn: () =>
      fetch('http://127.0.0.1:11222/music/playlists/all').then((res) => {
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
    <div className="flex flex-col overflow-y-scroll gap-12 p-6 mb-30">
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

      {/* Recently Played */}
      <div>
        <h2 className="text-2xl mb-4">Recently Played</h2>
        <div className="flex flex-row gap-4 overflow-x-auto overflow-y-hidden pb-2">
          {queryRecentlyPlayedAlbums.data?.map((album) => (
            <Link
              key={album.id}
              to={`/app/album/$ratingKey`}
              params={{ ratingKey: album.ratingKey }}
            >
              <Card className="flex p-4 justify-center min-w-36 h-48 shrink-0">
                <CardHeader className="p-0">
                  <img
                    src={album.thumb}
                    alt={album.title}
                    className="w-full object-cover rounded-lg"
                  />
                  <CardTitle className="overflow-hidden text-ellipsis text-nowrap">
                    {album.title}
                  </CardTitle>
                  <CardDescription>{album.artist}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Recently Added */}
      <div>
        <h2 className="text-2xl mb-4">Recently Added</h2>
        <div className="flex flex-row gap-4 overflow-x-auto overflow-y-hidden pb-2">
          {queryRecentlyAddedAlbums.data?.map((album) => (
            <Link
              key={album.id}
              to={`/app/album/$ratingKey`}
              params={{ ratingKey: album.ratingKey }}
            >
              <Card className="flex p-4 justify-center min-w-36 h-48 shrink-0">
                <CardHeader className="p-0">
                  <img
                    src={album.thumb}
                    alt={album.title}
                    className="w-full object-cover rounded-lg"
                  />
                  <CardTitle className="overflow-hidden text-ellipsis text-nowrap">
                    {album.title}
                  </CardTitle>
                  <CardDescription>{album.artist}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Recommended */}
      <div>
        <h2 className="text-2xl mb-4">Recommended for You</h2>
        <div className="flex flex-row gap-4 overflow-x-scroll overflow-y-hidden">
          {queryAllPlaylists.data.map((playlist) => (
            <Link
              key={playlist.id}
              to={`/app/playlist/$ratingKey`}
              params={{ ratingKey: playlist.ratingKey }}
            >
              <Card key={playlist.id} className="flex p-4 justify-center min-w-36 h-48">
                <CardHeader className="p-0">
                  <img
                    src={playlist.composite || noPlaylistCover}
                    alt={playlist.title}
                    className="w-full object-cover rounded-lg"
                  />
                  <CardTitle className="overflow-hidden text-ellipsis text-nowrap">
                    {playlist.title}
                  </CardTitle>
                  {playlist.duration !== null ? (
                    <CardDescription>
                      {dayjs.duration(playlist.duration).hours() + 'hr '}
                      {dayjs.duration(playlist.duration).minutes() + 'min'}
                    </CardDescription>
                  ) : (
                    <CardDescription>
                      <p>0hr 0min</p>
                    </CardDescription>
                  )}
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
