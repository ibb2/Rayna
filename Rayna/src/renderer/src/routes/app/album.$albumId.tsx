import { Button } from '@/components/ui/button';
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { Play, Heart, Plus, MoreVertical, Clock } from 'lucide-react';

export const Route = createFileRoute('/app/album/$albumId')({
  component: AlbumPage
})

const albumData: Record<string, any> = {
  '1': {
    id: 1,
    name: 'VULTURES 1',
    artist: '¥$',
    artistId: 1,
    year: 2024,
    image: 'https://images.unsplash.com/photo-1644855640845-ab57a047320e?w=500',
    tracks: [
      { id: 1, number: 1, name: 'STARS', duration: '1:55' },
      { id: 2, number: 2, name: 'KEYS TO MY LIFE', duration: '2:54' },
      { id: 3, number: 3, name: 'PAID', duration: '3:15' },
      { id: 4, number: 4, name: 'TALKING', duration: '3:05' },
      { id: 5, number: 5, name: 'BACK TO ME', duration: '4:55' },
      { id: 6, number: 6, name: 'HOODRAT', duration: '3:42' },
      { id: 7, number: 7, name: 'DO IT', duration: '3:45' },
      { id: 8, number: 8, name: 'PAPERWORK', duration: '2:25' },
      { id: 9, number: 9, name: 'BURN', duration: '4:12' },
      { id: 10, number: 10, name: 'VULTURES', duration: '3:56' },
    ],
  },
  '2': {
    id: 2,
    name: 'VULTURES 2',
    artist: '¥$',
    artistId: 1,
    year: 2024,
    image: 'https://images.unsplash.com/photo-1647220419119-316822d9d053?w=500',
    tracks: [
      { id: 1, number: 1, name: 'FIELD TRIP', duration: '2:45' },
      { id: 2, number: 2, name: 'SLIDE', duration: '3:22' },
      { id: 3, number: 3, name: 'FOREVER ROLLING', duration: '3:48' },
      { id: 4, number: 4, name: 'PROMOTION', duration: '2:58' },
      { id: 5, number: 5, name: 'LIFESTYLE', duration: '4:15' },
      { id: 6, number: 6, name: 'SKY CITY', duration: '3:33' },
    ],
  },
};

export function AlbumPage() {
  const { albumId: id } = Route.useParams();
  const album = albumData[id || '1'] || albumData['1'];

  return (
    <div className="flex flex-col h-full bg-zinc-900">

      <main className="flex-1 overflow-y-auto">
        <div className="p-6">
          {/* Album Header */}
          <div className="flex gap-6 mb-6">
            <img
              src={album.image}
              alt={album.name}
              className="w-48 h-48 rounded-lg shadow-xl"
            />
            <div className="flex flex-col justify-between py-2">
              <div>
                <div className="text-zinc-400 text-sm mb-2">ALBUM</div>
                <h1 className="text-white text-4xl mb-3">{album.name}</h1>
                <Link to={`/app/artist/${album.artistId}`} className="text-zinc-300 hover:text-white hover:underline text-lg">
                  {album.artist}
                </Link>
              </div>
              <div className="flex items-center gap-2 text-zinc-400 text-sm">
                <span>{album.year}</span>
                <span>•</span>
                <span>{album.tracks.length} tracks</span>
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
              Like
            </Button>
            <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white hover:bg-zinc-800">
              <Plus size={20} />
            </Button>
            <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white hover:bg-zinc-800">
              <MoreVertical size={20} />
            </Button>
          </div>

          {/* Track List */}
          <div className="bg-zinc-800/30 rounded-lg">
            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-4 py-2 text-zinc-400 text-sm border-b border-zinc-800">
              <div className="w-8 text-center">#</div>
              <div>Title</div>
              <div></div>
              <div className="w-16 text-right">
                <Clock size={14} className="inline" />
              </div>
            </div>

            {album.tracks.map((track: any) => (
              <div
                key={track.id}
                className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-4 py-3 rounded group hover:bg-zinc-700/50 transition-colors cursor-pointer"
              >
                <div className="text-zinc-400 text-center w-8">{track.number}</div>
                <div className="text-white">{track.name}</div>
                <button className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Heart size={16} className="text-zinc-400 hover:text-white" />
                </button>
                <div className="text-zinc-400 text-sm w-16 text-right">{track.duration}</div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
