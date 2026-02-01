import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle
} from '@/components/ui/item'
import { PlexServer } from '@/types'
import { useNavigate } from '@tanstack/react-router'
import { Server } from 'lucide-react'
import { useEffect, useState } from 'react'


export default function SelectServer({progress}) {
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
              onClick={async () => {
                await window.api.auth.selectServer(server)

                const accessToken = await window.api.auth.getUserAccessToken()
                console.log('serverUrl:', server.connections)

                const response = await fetch(`http://127.0.0.1:34567/init`, {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    serverUrl: server.connections[0].uri
                  })
                })
                await response.json()


                // navigate({
                //   to: '/app',
                //   replace: true
                // })

                progress()
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
