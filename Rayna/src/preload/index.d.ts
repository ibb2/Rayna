import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      db: {
        get: (key: string) => Promise<any>
        set: (key: string, value: any) => Promise<void>
      }
      auth: {
        generateClientIdentifier: () => Promise<string>
        generateKeyPair: () => Promise<[string, string]>
        generatePin: () => Promise<any>
        checkPin: () => Promise<any>
        checkPinStatus: (id: string) => Promise<any>
      }
    }
  }
}
