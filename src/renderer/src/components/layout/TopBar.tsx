import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCanGoBack, useRouter, useRouterState } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { ModeToggle } from '../mode-toggle'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../ui/dropdown-menu'
import { Icon } from '../ui/Icon'

export function TopBar() {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const routerState = useRouterState()

  // Check if we can go forward by comparing current index with history length
  const canGoForward =
    routerState.resolvedLocation?.state?.__TSR_index !== undefined
      ? (routerState.resolvedLocation?.state.__TSR_index as number) < router.history.length - 1
      : false

  return (
    <div className="flex h-16 items-center justify-between py-4 bg-background/95 backdrop-blur sticky top-0 z-10 w-full">
      <div className="flex items-center gap-2">
        <Button
          disabled={!canGoBack}
          variant="ghost"
          size="icon-sm"
          onClick={() => router.history.back()}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button
          disabled={!canGoForward}
          variant="ghost"
          size="icon-sm"
          onClick={() => router.history.forward()}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex flex-1 max-w-md mx-4">
        <div className="relative w-full">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="What do you want to play?"
            className="pl-8 rounded-full bg-secondary border-0 w-full"
          />
        </div>
      </div>

      <div className="flex gap-4">
        {/* <Link to={'/app/settings'}> */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Avatar className="mb-1">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>CN</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="mb-1">
            {/*<DropdownMenuGroup>
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem>
                <ModeToggle />
              </DropdownMenuItem>
              <DropdownMenuItem>Billing</DropdownMenuItem>
            </DropdownMenuGroup>*/}
            <DropdownMenuGroup>
              <DropdownMenuLabel>Personalisation</DropdownMenuLabel>
              <DropdownMenuItem className="flex flex-row gap-2">
                <Icon name="Moon" />
                <ModeToggle />
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {/* <DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Team</DropdownMenuItem>
              <DropdownMenuItem>Subscription</DropdownMenuItem>
            </DropdownMenuGroup> */}
            <DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Icon name="LogOut"></Icon>Logout
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* <Settings className="w-5" /> Change back to UserProfile image */}
        {/* </Link> */}
      </div>
    </div>
  )
}
