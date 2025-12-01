import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious
} from '@/components/ui/carousel'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
import relativeTime from 'dayjs/plugin/relativeTime'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemTitle
} from '@/components/ui/item'

import noPlaylistCover from '../../assets/no-playlist-cover.png'

dayjs.extend(duration)
dayjs.extend(relativeTime)

export const Route = createFileRoute('/app/')({
  component: Home
})

const quickAccessAlbums = [
  {
    id: 1,
    name: 'VULTURES 1',
    artist: '¥$',
    image: 'https://images.unsplash.com/photo-1644855640845-ab57a047320e?w=300'
  },
  {
    id: 2,
    name: 'VULTURES 2',
    artist: '¥$',
    image: 'https://images.unsplash.com/photo-1647220419119-316822d9d053?w=300'
  },
  {
    id: 3,
    name: 'Blonde',
    artist: 'Frank Ocean',
    image: 'https://images.unsplash.com/photo-1616688920494-6758cf681803?w=300'
  },
  {
    id: 4,
    name: 'Currents',
    artist: 'Tame Impala',
    image: 'https://images.unsplash.com/photo-1650765814820-72eb486881e5?w=300'
  },
  {
    id: 5,
    name: 'LONG.LIVE.A$AP',
    artist: 'A$AP Rocky',
    image: 'https://images.unsplash.com/photo-1692176548571-86138128e36c?w=300'
  },
  {
    id: 6,
    name: 'The Blue Note',
    artist: 'Various Artists',
    image: 'https://images.unsplash.com/photo-1503853585905-d53f628e46ac?w=300'
  }
]

const recentlyPlayed = [
  {
    id: 1,
    name: 'VULTURES 1',
    artist: '¥$',
    image: 'https://images.unsplash.com/photo-1644855640845-ab57a047320e?w=300'
  },
  {
    id: 2,
    name: 'VULTURES 2',
    artist: '¥$',
    image: 'https://images.unsplash.com/photo-1647220419119-316822d9d053?w=300'
  },
  {
    id: 3,
    name: 'LONG.LIVE.A$AP',
    artist: 'A$AP Rocky',
    image: 'https://images.unsplash.com/photo-1692176548571-86138128e36c?w=300'
  },
  {
    id: 4,
    name: 'The Blue Note',
    artist: 'Various Artists',
    image: 'https://images.unsplash.com/photo-1503853585905-d53f628e46ac?w=300'
  },
  {
    id: 5,
    name: 'Currents',
    artist: 'Tame Impala',
    image: 'https://images.unsplash.com/photo-1650765814820-72eb486881e5?w=300'
  },
  {
    id: 6,
    name: 'Blonde',
    artist: 'Frank Ocean',
    image: 'https://images.unsplash.com/photo-1616688920494-6758cf681803?w=300'
  }
]

export default function Home() {
  // queries
  const queryTopEight = useQuery({
    queryKey: ['top-eight'],
    queryFn: () => fetch('http://127.0.0.1:8000/music/library/top-eight').then((res) => res.json())
  })

  const queryRecentlyPlayedAlbums = useQuery({
    queryKey: ['albums'],
    queryFn: () =>
      fetch('http://127.0.0.1:8000/music/albums/recently-played').then((res) => res.json())
  })

  const queryRecentlyAddedAlbums = useQuery({
    queryKey: ['album'],
    queryFn: () =>
      fetch('http://127.0.0.1:8000/music/albums/recently-added').then((res) => res.json())
  })

  const queryAllPlaylists = useQuery({
    queryKey: ['playlist'],
    queryFn: () => fetch('http://127.0.0.1:8000/music/playlists/all').then((res) => res.json())
  })

  if (
    queryRecentlyAddedAlbums.isLoading ||
    queryRecentlyPlayedAlbums.isLoading ||
    queryAllPlaylists.isLoading ||
    queryTopEight.isLoading
  )
    return <div>Loading...</div>
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
    <div className="flex flex-col overflow-auto p-6 pb-48 gap-8">
      {/* Quick Access Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 w-full">
        {queryTopEight.data.map((x) => (
          <Item
            key={x.id}
            variant={'muted'}
            className="flex flex-row hover:bg-slate-300/40 overflow-hidden"
          >
            <ItemMedia variant={'image'}>
              <img src={x.thumb} alt={x.title} className="w-20 object-cover rounded-lg" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{x.title}</ItemTitle>
            </ItemContent>
          </Item>
        ))}
      </div>

      {/* Recently Played */}
      <section className="">
        <h2 className="text-2xl mb-4">Recently Played</h2>
        <div className="flex flex-row gap-4 overflow-x-auto overflow-y-hidden pb-2">
          {queryRecentlyPlayedAlbums.data?.map((album) => (
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
                <CardDescription>{album.artist}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* Recently Added */}
      <section>
        <h2 className="text-2xl mb-4">Recently Added</h2>
        <div className="flex flex-row gap-4 overflow-x-auto overflow-y-hidden pb-2">
          {queryRecentlyAddedAlbums.data?.map((album) => (
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
                <CardDescription>{album.artist}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* Recommended */}
      <section>
        <h2 className="text-2xl mb-4">Recommended for You</h2>
        <div className="flex flex-row gap-4 overflow-x-scroll overflow-y-hidden">
          {queryAllPlaylists.data.map((playlist) => (
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
          ))}
        </div>
      </section>
    </div>
  )
}
