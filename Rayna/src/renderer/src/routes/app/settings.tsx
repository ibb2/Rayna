import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/app/settings')({
  component: SettingsPage
})

export function SettingsPage() {
  const [volume, setVolume] = useState([70])
  const [crossfade, setCrossfade] = useState([0])

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-8">
          <div>
            <h1 className="text-white text-3xl mb-2">Settings</h1>
            <p className="text-zinc-400">Manage your pMusic preferences</p>
          </div>

          <Separator className="bg-zinc-800" />

          {/* Account Section */}
          <section className="space-y-4">
            <h2 className="text-white text-xl">Account</h2>
            <div className="bg-zinc-800/40 rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white">Username</div>
                  <div className="text-zinc-400 text-sm">music_lover_2024</div>
                </div>
                <Button
                  variant="outline"
                  className="bg-transparent border-zinc-700 text-white hover:bg-zinc-800"
                >
                  Edit Profile
                </Button>
              </div>
              <Separator className="bg-zinc-700" />
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white">Plex Server</div>
                  <div className="text-zinc-400 text-sm">Connected to: home-server.local</div>
                </div>
                <Button
                  variant="outline"
                  className="bg-transparent border-zinc-700 text-white hover:bg-zinc-800"
                >
                  Change Server
                </Button>
              </div>
            </div>
          </section>

          <Separator className="bg-zinc-800" />

          {/* Playback Section */}
          <section className="space-y-4">
            <h2 className="text-white text-xl">Playback</h2>
            <div className="bg-zinc-800/40 rounded-lg p-6 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="crossfade" className="text-white">
                  Crossfade
                </Label>
                <div className="flex items-center gap-4">
                  <Slider
                    id="crossfade"
                    value={crossfade}
                    onValueChange={setCrossfade}
                    max={12}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-zinc-400 text-sm w-12">{crossfade[0]}s</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="gapless" className="text-white">
                    Gapless Playback
                  </Label>
                  <p className="text-zinc-400 text-sm">Eliminates silence between tracks</p>
                </div>
                <Switch id="gapless" />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="normalize" className="text-white">
                    Normalize Volume
                  </Label>
                  <p className="text-zinc-400 text-sm">Set the same volume level for all songs</p>
                </div>
                <Switch id="normalize" defaultChecked />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quality" className="text-white">
                  Audio Quality
                </Label>
                <Select defaultValue="high">
                  <SelectTrigger id="quality" className="bg-zinc-900 border-zinc-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                    <SelectItem value="low">Low (96 kbps)</SelectItem>
                    <SelectItem value="medium">Medium (160 kbps)</SelectItem>
                    <SelectItem value="high">High (320 kbps)</SelectItem>
                    <SelectItem value="lossless">Lossless (FLAC)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <Separator className="bg-zinc-800" />

          {/* Display Section */}
          <section className="space-y-4">
            <h2 className="text-white text-xl">Display</h2>
            <div className="bg-zinc-800/40 rounded-lg p-6 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="theme" className="text-white">
                  Theme
                </Label>
                <Select defaultValue="dark">
                  <SelectTrigger id="theme" className="bg-zinc-900 border-zinc-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="auto">Auto</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="animations" className="text-white">
                    Show Animations
                  </Label>
                  <p className="text-zinc-400 text-sm">Enable UI animations and transitions</p>
                </div>
                <Switch id="animations" defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="now-playing" className="text-white">
                    Show Now Playing Bar
                  </Label>
                  <p className="text-zinc-400 text-sm">Display currently playing track info</p>
                </div>
                <Switch id="now-playing" defaultChecked />
              </div>
            </div>
          </section>

          <Separator className="bg-zinc-800" />

          {/* Library Section */}
          <section className="space-y-4">
            <h2 className="text-white text-xl">Library</h2>
            <div className="bg-zinc-800/40 rounded-lg p-6 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="library-path" className="text-white">
                  Library Path
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="library-path"
                    value="/media/music"
                    className="bg-zinc-900 border-zinc-700 text-white"
                    readOnly
                  />
                  <Button
                    variant="outline"
                    className="bg-transparent border-zinc-700 text-white hover:bg-zinc-800"
                  >
                    Browse
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="auto-organize" className="text-white">
                    Auto-organize Files
                  </Label>
                  <p className="text-zinc-400 text-sm">
                    Automatically organize music files by artist and album
                  </p>
                </div>
                <Switch id="auto-organize" />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="download-metadata" className="text-white">
                    Download Metadata
                  </Label>
                  <p className="text-zinc-400 text-sm">
                    Fetch album art and track info from online sources
                  </p>
                </div>
                <Switch id="download-metadata" defaultChecked />
              </div>

              <Button className="bg-zinc-700 hover:bg-zinc-600 text-white">Scan Library</Button>
            </div>
          </section>

          <Separator className="bg-zinc-800" />

          {/* Storage Section */}
          <section className="space-y-4">
            <h2 className="text-white text-xl">Storage</h2>
            <div className="bg-zinc-800/40 rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white">Cache Size</div>
                  <div className="text-zinc-400 text-sm">2.4 GB of cached data</div>
                </div>
                <Button
                  variant="outline"
                  className="bg-transparent border-zinc-700 text-white hover:bg-zinc-800"
                >
                  Clear Cache
                </Button>
              </div>
            </div>
          </section>

          <div className="pb-8"></div>
        </div>
      </main>
    </div>
  )
}
