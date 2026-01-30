import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { DatabaseManager } from './database'
import { PlexServer } from './types'

const API_PORT = process.env.API_PORT || 34567

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit()
}

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('rayna', process.execPath, [join(process.cwd(), '.')])
  }
} else {
  app.setAsDefaultProtocolClient('rayna')
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} // We will handle the second-instance event inside whenReady or global scope ensuring we don't start duplicate apps.
// Actually, standard pattern is to quit immediately if no lock.
// Moving the rest of the logic inside the lock check or just above.

function createWindow(): BrowserWindow {
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
    // Customize title bar
    // titleBarStyle: 'hidden',
    // ...(process.platform !== 'darwin' ? { titleBarOverlay: true } : {})
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

  return mainWindow
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  startApi()
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

  ipcMain.handle('auth:getUserSelectedServer', () => auth.getUserSelectedServer())

  ipcMain.handle('auth:getUserAccessToken', () => auth.getUserAccessToken())

  ipcMain.handle('auth:closeLoopbackServer', () => auth.closeLoopbackServer())

  // API Diagnostic IPC handlers
  ipcMain.handle('api:get-logs', () => apiLogs)
  ipcMain.handle('api:get-status', () => {
    if (!apiProcess) return 'not_started'
    if (apiProcess.exitCode !== null) return `exited_code_${apiProcess.exitCode}`
    return 'running'
  })

  // Wait for API to be ready before creating window
  const mainWindow = createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Protocol handler for Windows/Linux
  app.on('second-instance', () => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    // Parse commandLine for deep link if needed, but for now we just focus.
    // url usually in commandLine.pop()
  })

  // Protocol handler for macOS
  app.on('open-url', (event) => {
    event.preventDefault()
    // dialog.showErrorBox('Welcome Back', `You arrived from: ${url}`)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
})

import { spawn, ChildProcess } from 'child_process'

let apiProcess: ChildProcess | null = null
let apiLogs = ''

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (apiProcess) {
    apiProcess.kill()
    apiProcess = null
  }
})

function startApi(): void {
  const binaryName = process.platform === 'win32' ? 'api.exe' : 'api'
  const apiPath = is.dev
    ? join(
        __dirname,
        `../../python-backend/.venv/${process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'}`
      )
    : join(process.resourcesPath, 'api', binaryName)

  const args = is.dev ? [join(__dirname, '../../python-backend/entry.py')] : []
  const cwd = is.dev ? join(__dirname, '../../python-backend') : join(process.resourcesPath, 'api')

  const logPrefix = `[API Start] Binary: ${apiPath} | CWD: ${cwd}\n`
  console.log(logPrefix)
  apiLogs += logPrefix

  // Check if file exists in production
  if (!is.dev) {
    const fs = require('fs')
    if (!fs.existsSync(apiPath)) {
      const err = `CRITICAL: API binary not found at ${apiPath}\n`
      console.error(err)
      apiLogs += err
    } else {
      try {
        fs.accessSync(apiPath, fs.constants.X_OK)
        apiLogs += `API binary is executable.\n`
      } catch (e) {
        apiLogs += `WARNING: API binary is NOT executable or accessible.\n`
      }
    }

    if (!fs.existsSync(cwd)) {
      apiLogs += `CRITICAL: API CWD does not exist: ${cwd}\n`
    }
  }

  try {
    apiProcess = spawn(apiPath, args, {
      cwd,
      env: { ...process.env, API_PORT: API_PORT!.toString() }
    })

    apiProcess.stdout?.on('data', (data) => {
      const log = data.toString()
      console.log(`API: ${log}`)
      apiLogs += log
    })

    apiProcess.stderr?.on('data', (data) => {
      const log = data.toString()
      console.error(`API Error: ${log}`)
      apiLogs += log
    })

    apiProcess.on('error', (err) => {
      const log = `Failed to spawn API process: ${err.message}\n`
      console.error(log)
      apiLogs += log
    })

    apiProcess.on('exit', (code, signal) => {
      const log = `API process exited with code ${code} and signal ${signal}\n`
      console.log(log)
      apiLogs += log
      apiProcess = null
    })
  } catch (err: any) {
    const log = `CRITICAL: Exception when spawning API: ${err.message}\n`
    console.error(log)
    apiLogs += log
  }
}

// Ensure startApi is called

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
