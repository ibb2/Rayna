import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Volume2,
  Volume1,
  Volume,
  VolumeX
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { Progress } from '../ui/progress'

export function PlayerFooter() {
  const { data: status, refetch } = useQuery({
    queryKey: ['playerStatus'],
    queryFn: () =>
      fetch('http://127.0.0.1:34567/player/status').then((res) => {
        if (!res.ok) throw new Error('Network response was not ok')
        return res.json()
      }),
    refetchInterval: 1000
  })

  const [position, setPosition] = useState(0)
  const [mute, toggleMute] = useState(false)

  useEffect(() => {
    if (status?.position) {
      setPosition(status.position)
    }
  }, [status?.position])

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (status?.is_playing) {
      interval = setInterval(() => {
        setPosition((prev) => prev + 0.1)
      }, 100)
    }
    return () => clearInterval(interval)
  }, [status?.is_playing])

  const handlePlayPause = async () => {
    if (status?.is_playing) {
      await fetch('http://127.0.0.1:34567/player/pause', { method: 'POST' })
    } else {
      await fetch('http://127.0.0.1:34567/player/play', { method: 'POST' })
    }
    refetch()
  }

  const handleNext = async () => {
    await fetch('http://127.0.0.1:34567/player/next', { method: 'POST' })
    refetch()
  }

  const handlePrev = async () => {
    await fetch('http://127.0.0.1:34567/player/prev', { method: 'POST' })
    refetch()
  }

  const handleSeek = async (pos: number) => {
    await fetch(`http://127.0.0.1:34567/player/seek/${pos}`)
    setPosition(pos)
    refetch()
  }

  const handleVolume = async (newVolume: number) => {
    await fetch(`http://127.0.0.1:34567/player/volume/${newVolume}`)
    refetch()
  }

  const handleMute = async () => {
    await fetch(`http://127.0.0.1:34567/player/volume/mute/${!mute}`)
    toggleMute(!mute)
    refetch()
  }

  const currentTrack = status?.current_track

  return (
    <div className="grid grid-cols-[minmax(auto,0.5fr)_1fr_minmax(auto,0.5fr)] h-20 bg-card border-t border-border w-full">
      {/* Now Playing Info */}
      <div className="flex flex-row items-center gap-2 pl-2">
        <div className="h-14 w-14 bg-muted rounded-md flex items-center justify-center overflow-hidden">
          {currentTrack?.thumb && (
            <img src={currentTrack.thumb} alt="Cover" className="w-full h-full object-cover" />
          )}
        </div>
        <div className="flex flex-col ">
          <span className="text-sm font-semibold hover:underline cursor-pointer truncate max-w-[200px]">
            {currentTrack?.title || ''}
          </span>
          <span className="text-xs text-muted-foreground hover:underline cursor-pointer truncate max-w-[200px]">
            {currentTrack?.artist || ''}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col justify-center items-center w-full">
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
            onClick={handlePrev}
          >
            <SkipBack className="h-5 w-5 fill-current" />
          </Button>
          <Button size="icon" className="rounded-full h-8 w-8" onClick={handlePlayPause}>
            {status?.is_playing ? (
              <Pause className="h-4 w-4 fill-current" />
            ) : (
              <Play className="h-4 w-4 fill-current pl-0.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            onClick={handleNext}
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
          <span className="w-8">{dayjs.duration(position * 1000).format('m:ss')}</span>
          <div className="group relative w-full flex items-center h-6 cursor-pointer">
            {/* Progress bar - visible by default, hidden on hover */}
            <div className="w-full group-hover:hidden">
              <Progress
                value={(position / (status?.duration || 1)) * 100}
                className="w-full h-1.5"
              />
            </div>

            {/* Slider - hidden by default, visible on hover */}
            <div className="w-full hidden group-hover:block">
              <Slider
                value={[position]}
                onValueChange={(pos) => setPosition(pos[0])}
                max={status?.duration || 100}
                step={0.1}
                onValueCommit={(pos) => handleSeek(Math.round(pos[0]))}
                className="w-full"
              />
            </div>
          </div>
          <span className="w-8">
            {status?.duration ? dayjs.duration(status.duration * 1000).format('m:ss') : '0:00'}
          </span>
        </div>
      </div>

      {/* Volume & Extra Controls */}
      <div className="flex flex-row items-center justify-end gap-2">
        {/*<Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <Mic2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <ListMusic className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <Laptop2 className="h-4 w-4" />
        </Button>*/}
        <div className="flex items-center gap-x-1 w-32">
          <div>
            {status?.volume === 0 ? (
              <Button variant={'ghost'} size={'icon-sm'} onClick={handleMute}>
                <VolumeX className="h-4 w-4 text-muted-foreground" />
              </Button>
            ) : (
              <Button variant={'ghost'} size={'icon-sm'} onClick={handleMute}>
                {status?.volume < 0.3 ? (
                  <Volume className="h-4 w-4 text-muted-foreground" />
                ) : status?.volume < 0.7 ? (
                  <Volume1 className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Volume2 className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            )}
          </div>
          <>
            <Slider
              defaultValue={[1]}
              value={[status?.volume]}
              onValueChange={(value) => handleVolume(value[0])}
              max={1}
              step={1 / 100}
              className="w-20"
            />
          </>
        </div>
      </div>
    </div>
  )
}
