/// <reference types="vite/client" />

interface Window {
  api: {
    db: {
      get: (key: string) => Promise<any>
      set: (key: string, value: any) => Promise<void>
    }
    auth: {
      isUserSignedIn(): () => boolean
      generateClientIdentifier: () => Promise<string>
      generateKeyPair: () => Promise<[string, string]>
      generatePin: () => Promise<any>
      checkPin: () => Promise<{ authUrl: string; plexId: string; plexCode: string }>
      getServers: () => Promise<PlexServer[]>
      selectServer: (server: PlexServer) => Promise<void>
      isServerSelected: () => boolean
    }
  }
}
