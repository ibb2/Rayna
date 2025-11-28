import { Card, CardContent } from '@/components/ui/card'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious
} from '@/components/ui/carousel'
import { createFileRoute, Link } from '@tanstack/react-router'

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
  return (
    <div className="flex-1 h-full overflow-y-scroll px-16 py-4 pb-48 ">
      {/* Quick Access Grid */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {quickAccessAlbums.map((album) => (
          <Link
            key={album.id}
            to={`/app/album/${album.id}`}
            className="flex items-center gap-4 bg-white/10 hover:bg-white/20 transition-colors rounded overflow-hidden group"
          >
            <img src={album.image} alt={album.name} className="w-20 h-20 object-cover" />
            <span>{album.name}</span>
          </Link>
        ))}
      </div>

      {/* Recently Played */}
      <section>
        <h2 className="text-2xl mb-4">Recently Played</h2>
        <div className="grid grid-cols-6 gap-4">
          {recentlyPlayed.map((album) => (
            <Link
              key={album.id}
              to={`/app/album/${album.id}`}
              className="bg-zinc-300/40 p-4 rounded-lg hover:bg-zinc-400/60 transition-colors group"
            >
              <div className="aspect-square mb-4 relative">
                <img
                  src={album.image}
                  alt={album.name}
                  className="w-full h-full object-cover rounded-md"
                />
              </div>
              <h3>{album.name}</h3>
              <p className="text-sm truncate">{album.artist}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Recently Added */}
      <section>
        <h2 className="text-2xl mt-8">Recently Added</h2>
        <div className="grid grid-cols-6 gap-4">
          {recentlyPlayed.map((album) => (
            <Link
              key={album.id}
              to={`/app/album/${album.id}`}
              className="bg-zinc-300/40 p-4 rounded-lg hover:bg-zinc-400/60 transition-colors group"
            >
              <div className="aspect-square mb-4 relative">
                <img
                  src={album.image}
                  alt={album.name}
                  className="w-full h-full object-cover rounded-md"
                />
              </div>
              <h3>{album.name}</h3>
              <p className="text-sm truncate">{album.artist}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Recommended */}
      <section className="mt-8">
        <h2 className="text-2xl mb-4">Recommended for You</h2>
        <div className="grid grid-cols-6 gap-4">
          {recentlyPlayed
            .slice()
            .reverse()
            .map((album) => (
              <Link
                key={`rec-${album.id}`}
                to={`/app/album/${album.id}`}
                className="bg-zinc-300/40 p-4 rounded-lg hover:bg-zinc-400/60 transition-colors group"
              >
                <div className="aspect-square mb-4 relative">
                  <img
                    src={album.image}
                    alt={album.name}
                    className="w-full h-full object-cover rounded-md"
                  />
                </div>
                <h3 className=" truncate mb-1">{album.name}</h3>
                <p className="text-sm truncate">{album.artist}</p>
              </Link>
            ))}
        </div>
      </section>
    </div>
  )
}
