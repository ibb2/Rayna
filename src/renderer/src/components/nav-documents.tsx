'use client'

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar'
import { LucideIcon } from 'lucide-react'

export function NavDocuments({
  items
}: {
  items: {
    name: string
    url: string
    icon: LucideIcon
  }[]
}) {
  // const { isMobile } = useSidebar()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Your Library</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.name}>
            <SidebarMenuButton asChild>
              <a href={item.url}>
                <item.icon />
                <span>{item.name}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
