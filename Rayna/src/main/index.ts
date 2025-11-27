import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { DatabaseManager } from './database'
import { PlexServer } from './types'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  const db = new DatabaseManager()
  ipcMain.handle('db:get', (_, key) => db.get(key))
  ipcMain.handle('db:set', (_, key, value) => db.set(key, value))

  // Authentication IPC handlers
  const Authentication = (await import('./plex/authentication')).default
  const auth = new Authentication()

  ipcMain.handle('auth:generateClientIdentifier', async () => {
    return auth.generateClientIdentifier()
  })

  ipcMain.handle('auth:generateKeyPair', async () => {
    return await auth.generateKeyPair()
  })

  ipcMain.handle('auth:generatePin', async () => {
    return await auth.generatePin()
  })

  ipcMain.handle('auth:checkPin', async () => {
    return await auth.checkPin()
  })

  ipcMain.handle('auth:checkPinStatus', async (_, id) => {
    return await auth.checkPinStatus(id)
  })

  ipcMain.handle('auth:isUserSignedIn', () => auth.isUserSignedIn())

  ipcMain.handle('auth:getServers', () => auth.getServers())

  ipcMain.handle('auth:selectServer', (_, server: PlexServer) => auth.selectServer(server))

  ipcMain.handle('auth:isServerSelected', () => auth.isServerSelected())

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
