import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  db: {
    get: (key: string) => ipcRenderer.invoke('db:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('db:set', key, value)
  },
  auth: {
    generateClientIdentifier: () => ipcRenderer.invoke('auth:generateClientIdentifier'),
    generateKeyPair: () => ipcRenderer.invoke('auth:generateKeyPair'),
    generatePin: () => ipcRenderer.invoke('auth:generatePin'),
    checkPin: () => ipcRenderer.invoke('auth:checkPin'),
    checkPinStatus: (id: string) => ipcRenderer.invoke('auth:checkPinStatus', id)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
