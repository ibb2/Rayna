import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'

export function TopBar() {
  return (
    <div className="flex h-16 items-center justify-between px-6 py-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full bg-black/50 hover:bg-black/70 text-white"
          onClick={() => window.history.back()}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full bg-black/50 hover:bg-black/70 text-white"
          onClick={() => window.history.forward()}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex flex-1 max-w-md mx-4">
        <div className="relative w-full">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="What do you want to play?"
            className="pl-8 rounded-full bg-secondary border-0"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* User profile or other actions */}
        <Button variant="ghost" className="font-semibold">
          Sign up
        </Button>
        <Button className="rounded-full font-bold px-8">Log in</Button>
      </div>
    </div>
  )
}
