/// <reference types="vite/client" />

interface Window {
  api: {
    db: {
      get: (key: string) => Promise<any>
      set: (key: string, value: any) => Promise<void>
    }
  }
}
