import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCanGoBack,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { ModeToggle } from "../mode-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Icon } from "../ui/Icon";
import { useQuery } from "@tanstack/react-query";

export function TopBar() {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const routerState = useRouterState();

  // Queries
  const { isPending, error, data } = useQuery({
    queryKey: ["userInfo"],
    queryFn: async () => {
      const accessToken = await window.api.auth.getUserAccessToken();

      const response = await fetch(
        `https://plex.tv/api/v2/user?X-Plex-Token=${accessToken}`,
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) throw new Error("Network response was not ok");
      return response.json();
    },
  });

  // Check if we can go forward by comparing current index with history length
  const canGoForward =
    routerState.resolvedLocation?.state?.__TSR_index !== undefined
      ? (routerState.resolvedLocation?.state.__TSR_index as number) <
        router.history.length - 1
      : false;

  const logout = async () => {
    console.log("Logging out");
    const logoutSuccessful = await window.api.auth.logout();
    if (logoutSuccessful) {
      router.navigate({
        to: "/auth",
        replace: true,
      });
    }
    console.log("Logged out");
  };

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <div className="flex items-center justify-between bg-background/95 backdrop-blur sticky top-0 z-10 w-full mb-4">
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
              <AvatarImage src={data.thumb} />
              <AvatarFallback>CN</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="mb-1 mr-2" sideOffset={8}>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs">
                My Account
              </DropdownMenuLabel>
              {/* <DropdownMenuItem>Profile</DropdownMenuItem> */}
              <DropdownMenuItem
                onClick={() => router.navigate({ to: "/app/settings" })}
              >
                <Icon name="Cog" />
                Settings
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs">
                Personalization
              </DropdownMenuLabel>
              <DropdownMenuItem className="flex flex-row justify-between w-full gap-8">
                <div className="flex items-center gap-2">
                  <Icon name="Moon" />
                  <span>Theme</span>
                </div>
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
              <DropdownMenuItem onClick={() => logout()}>
                <Icon name="LogOut"></Icon>Logout
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* <Settings className="w-5" /> Change back to UserProfile image */}
        {/* </Link> */}
      </div>
    </div>
  );
}
