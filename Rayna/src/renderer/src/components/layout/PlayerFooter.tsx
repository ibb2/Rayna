import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  Play,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Mic2,
  ListMusic,
  Laptop2,
  Volume2
} from 'lucide-react'

export function PlayerFooter() {
  return (
    <div className="h-24 bg-card border-t border-border flex items-center justify-between px-4 fixed bottom-0 w-full z-50">
      {/* Now Playing Info */}
      <div className="flex items-center gap-4 w-[30%]">
        <div className="h-14 w-14 bg-muted rounded-md flex items-center justify-center">
          {/* Album Art Placeholder */}
          <span className="text-xs text-muted-foreground">Cover</span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold hover:underline cursor-pointer">Song Title</span>
          <span className="text-xs text-muted-foreground hover:underline cursor-pointer">
            Artist Name
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center gap-2 w-[40%]">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
          >
            <Shuffle className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
          >
            <SkipBack className="h-5 w-5 fill-current" />
          </Button>
          <Button size="icon" className="rounded-full h-8 w-8">
            <Play className="h-4 w-4 fill-current pl-0.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
          >
            <SkipForward className="h-5 w-5 fill-current" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
          >
            <Repeat className="h-4 w-4" />
          </Button>
        </div>
        <div className="w-full max-w-md flex items-center gap-2 text-xs text-muted-foreground">
          <span>0:00</span>
          <Slider defaultValue={[0]} max={100} step={1} className="w-full" />
          <span>3:45</span>
        </div>
      </div>

      {/* Volume & Extra Controls */}
      <div className="flex items-center justify-end gap-2 w-[30%]">
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <Mic2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <ListMusic className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <Laptop2 className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 w-32">
          <Volume2 className="h-4 w-4 text-muted-foreground" />
          <Slider defaultValue={[50]} max={100} step={1} />
        </div>
      </div>
    </div>
  )
}
