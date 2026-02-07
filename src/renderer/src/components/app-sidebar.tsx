/* eslint-disable @typescript-eslint/explicit-function-return-type */
import * as React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "./ui/sidebar";
import { NavMain } from "./nav-main";
import {
  AudioLines,
  AudioWaveform,
  ContactRound,
  DiscAlbum,
  Heart,
  Home,
  Music,
} from "lucide-react";

const data = {
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  navMain: [
    {
      title: "Home",
      url: "/app",
      icon: Home,
    },
    { title: "Albums", url: "/app/library/albums", icon: DiscAlbum },
    // {
    //   title: "Artists",
    //   url: "/app/library/artists",
    //   icon: ContactRound,
    // },
  ],
  // navClouds: [
  //   {
  //     title: 'Capture',
  //     icon: IconCamera,
  //     isActive: true,
  //     url: '#',
  //     items: [
  //       {
  //         title: 'Active Proposals',
  //         url: '#'
  //       },
  //       {
  //         title: 'Archived',
  //         url: '#'
  //       }
  //     ]
  //   },
  //   {
  //     title: 'Proposal',
  //     icon: IconFileDescription,
  //     url: '#',
  //     items: [
  //       {
  //         title: 'Active Proposals',
  //         url: '#'
  //       },
  //       {
  //         title: 'Archived',
  //         url: '#'
  //       }
  //     ]
  //   },
  //   {
  //     title: 'Prompts',
  //     icon: IconFileAi,
  //     url: '#',
  //     items: [
  //       {
  //         title: 'Active Proposals',
  //         url: '#'
  //       },
  //       {
  //         title: 'Archived',
  //         url: '#'
  //       }
  //     ]
  //   }
  // ],
  // navSecondary: [
  //   {
  //     title: 'Settings',
  //     url: '#',
  //     icon: IconSettings
  //   },
  //   {
  //     title: 'Get Help',
  //     url: '#',
  //     icon: IconHelp
  //   },
  //   {
  //     title: 'Search',
  //     url: '#',
  //     icon: IconSearch
  //   }
  // ],
  documents: [
    {
      name: "Liked Songs",
      url: "#",
      icon: Heart,
    },
    {
      name: "All Music",
      url: "#",
      icon: Music,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  // Check if running on macOS
  // const isMacOS = navigator.platform.toUpperCase().indexOf('MAC') >= 0

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="md:h-8 md:p-0">
              <div className="flex flex-row">
                <div className="bg-[#ffb150] dark:text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <AudioLines className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Rayna</span>
                  {/* <span className="truncate text-xs">Enterprise</span> */}
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        {/*<NavDocuments items={data.documents} />*/}
        {/*<NavSecondary items={data.navSecondary} className="mt-auto" /> */}
      </SidebarContent>
    </Sidebar>
  );
}
