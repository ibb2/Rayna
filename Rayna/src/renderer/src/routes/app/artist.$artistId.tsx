import { Button } from '@/components/ui/button';
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { Heart, MoreVertical, Play } from 'lucide-react';

export const Route = createFileRoute('/app/artist/$artistId')({
  component: ArtistPage
})

const artistData: Record<string, any> = {
  '1': {
    id: 1,
    name: '¥$',
    followers: '12.5M',
    verified: true,
    image: 'https://images.unsplash.com/photo-1647220419119-316822d9d053?w=500',
    albums: [
      { id: 1, name: 'VULTURES 1', year: 2024, image: 'https://images.unsplash.com/photo-1644855640845-ab57a047320e?w=300' },
      { id: 2, name: 'VULTURES 2', year: 2024, image: 'https://images.unsplash.com/photo-1647220419119-316822d9d053?w=300' },
    ],
    topTracks: [
      { id: 1, name: 'STARS', plays: '45.2M', duration: '1:55' },
      { id: 2, name: 'KEYS TO MY LIFE', plays: '38.7M', duration: '2:54' },
      { id: 3, name: 'PAID', plays: '32.1M', duration: '3:15' },
      { id: 4, name: 'TALKING', plays: '28.9M', duration: '3:05' },
      { id: 5, name: 'VULTURES', plays: '25.4M', duration: '3:56' },
    ],
  },
  '2': {
    id: 2,
    name: 'Frank Ocean',
    followers: '8.3M',
    verified: true,
    image: 'https://images.unsplash.com/photo-1616688920494-6758cf681803?w=500',
    albums: [
      { id: 3, name: 'Blonde', year: 2016, image: 'https://images.unsplash.com/photo-1616688920494-6758cf681803?w=300' },
    ],
    topTracks: [
      { id: 1, name: 'Ivy', plays: '52.3M', duration: '4:09' },
      { id: 2, name: 'Pink + White', plays: '48.1M', duration: '3:04' },
      { id: 3, name: 'Nights', plays: '45.7M', duration: '5:07' },
      { id: 4, name: 'Self Control', plays: '42.9M', duration: '4:10' },
      { id: 5, name: 'Thinkin Bout You', plays: '38.2M', duration: '3:21' },
    ],
  },
};

export function ArtistPage() {
  const { artistId: id } = Route.useParams();
  const artist = artistData[id || '1'] || artistData['1'];

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">
          {/* Artist Header */}
          <div className="flex gap-6 mb-6">
            <img
              src={artist.image}
              alt={artist.name}
              className="w-48 h-48 rounded-full object-cover shadow-xl"
            />
            <div className="flex flex-col justify-between py-2">
              <div>
                {artist.verified && <div className="text-blue-400 text-sm mb-2">✓ VERIFIED ARTIST</div>}
                <h1 className="text-white text-5xl mb-2">{artist.name}</h1>
                <div className="text-zinc-400">{artist.followers} monthly listeners</div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 mb-6">
            <Button className="bg-white text-black hover:bg-zinc-200 px-8">
              <Play size={18} className="mr-2" fill="black" />
              Play
            </Button>
            <Button variant="outline" className="border-zinc-700 text-white hover:bg-zinc-800">
              <Heart size={18} className="mr-2" />
              Follow
            </Button>
            <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white hover:bg-zinc-800">
              <MoreVertical size={20} />
            </Button>
          </div>

          {/* Popular Tracks */}
          <div className="mb-8">
            <h2 className="text-white text-2xl mb-4">Popular Tracks</h2>
            <div className="bg-zinc-800/30 rounded-lg">
              {artist.topTracks.map((track: any, index: number) => (
                <div
                  key={track.id}
                  className="flex items-center gap-4 px-4 py-3 rounded group hover:bg-zinc-700/50 transition-colors cursor-pointer"
                >
                  <div className="text-zinc-400 w-8 text-center">{index + 1}</div>
                  <div className="flex-1">
                    <div className="text-white">{track.name}</div>
                    <div className="text-zinc-400 text-sm">{track.plays}</div>
                  </div>
                  <div className="text-zinc-400 text-sm">{track.duration}</div>
                  <button className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <Heart size={16} className="text-zinc-400 hover:text-white" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Albums */}
          <div>
            <h2 className="text-white text-2xl mb-4">Albums</h2>
            <div className="grid grid-cols-6 gap-4">
              {artist.albums.map((album: any) => (
                <Link
                  key={album.id}
                  to={`/app/album/${album.id}`}
                  className="bg-zinc-800/40 p-4 rounded-lg hover:bg-zinc-800/60 transition-colors group"
                >
                  <div className="aspect-square mb-3 relative">
                    <img
                      src={album.image}
                      alt={album.name}
                      className="w-full h-full object-cover rounded-md"
                    />
                  </div>
                  <h3 className="text-white truncate mb-1">{album.name}</h3>
                  <p className="text-zinc-400 text-sm">{album.year}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
