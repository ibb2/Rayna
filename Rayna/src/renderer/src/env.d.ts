/// <reference types="vite/client" />

interface Window {
  api: {
    db: {
      get: (key: string) => Promise<any>
      set: (key: string, value: any) => Promise<void>
    }
    auth: {
      generateClientIdentifier: () => Promise<string>
      generateKeyPair: () => Promise<[string, string]>
      generatePin: () => Promise<any>
      checkPin: () => Promise<{ authUrl: string; plexId: string; plexCode: string }>
    }
  }
}
