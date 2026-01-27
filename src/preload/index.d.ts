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
        isUserSignedIn: () => Promise<boolean>
        getServers: () => Promise<any[]>
        selectServer: (server: any) => Promise<void>
        getUserSelectedServer: () => Promise<any | null>
        getUserAccessToken: () => Promise<string>
        isServerSelected: () => Promise<boolean>
        closeLoopbackServer: () => Promise<void>
      }
    }
  }
}
