/* eslint-disable @typescript-eslint/explicit-function-return-type */
import * as React from "react";
import { Sidebar, SidebarContent } from "./ui/sidebar";
import { NavMain } from "./nav-main";
import { Heart, Home, Music } from "lucide-react";

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
    // { title: 'Your Library', url: '/app', icon: Library }
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
      {/*<SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <div className="flex flex-row gap-4">
                <AudioWaveform className="size-5!" />
                <span className="text-base font-semibold group-data-[collapsible=icon]:hidden">
                  Rayna
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>*/}
      <SidebarContent className="mt-[0.6rem]">
        <NavMain items={data.navMain} />
        {/*<NavDocuments items={data.documents} />*/}
        {/*<NavSecondary items={data.navSecondary} className="mt-auto" /> */}
      </SidebarContent>
    </Sidebar>
  );
}
