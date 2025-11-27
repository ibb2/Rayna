import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemMedia,
  ItemTitle
} from '@/components/ui/item'
import { PlexServer } from '@/types'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Server } from 'lucide-react'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/server')({
  component: SelectServer
})

export default function SelectServer() {
  const navigate = useNavigate()

  const [load, onLoad] = useState(false)
  const [servers, setServers] = useState<PlexServer[]>([])

  const getServers = async () => {
    const s = await window.api.auth.getServers()
    setServers(s)
  }

  useEffect(() => {
    if (!load) {
      getServers()
      onLoad(true)
    }
  }, [load])

  return (
    <div className="flex flex-1 flex-col gap-12 overflow-y-auto p-4 h-full">
      <h1 className="scroll-m-20 text-center text-4xl font-bold tracking-tight text-balance">
        Servers
      </h1>
      <div>
        {servers.map((server: PlexServer) => (
          <Item key={server.name + server.createdAt} size="sm" variant={'outline'} asChild>
            <Button
              onClick={() => {
                window.api.auth.selectServer(server)
                navigate({
                  to: '/app'
                })
              }}
              className="w-full h-full"
              variant={'ghost'}
            >
              <ItemMedia className="self-center!">
                <Server className="size-8" />
              </ItemMedia>
              <ItemContent className="flex flex-col items-start">
                <ItemTitle>{server.name}</ItemTitle>
                <ItemDescription>{server.presence ? 'Online' : 'Offline'}</ItemDescription>
              </ItemContent>
              <ItemActions />
            </Button>
          </Item>
        ))}
      </div>
    </div>
  )
}
