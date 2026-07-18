import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { MicrosoftAuthService } from './auth/microsoftAuth.js'
import { loadMicrosoftClientId } from './config.js'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const rendererDirectory = path.join(currentDirectory, '../dist')

app.setName('EmpiLauncher')

function createWindow() {
  const window = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 820,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#111311',
    webPreferences: {
      preload: path.join(currentDirectory, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.once('ready-to-show', () => window.show())

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void window.loadFile(path.join(rendererDirectory, 'index.html'))
  }
}

function registerIpcHandlers(authService: MicrosoftAuthService, authReady: Promise<void>) {
  ipcMain.handle('app:get-info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
  }))

  ipcMain.handle('auth:get-status', async () => {
    await authReady
    return authService.getStatus()
  })

  ipcMain.handle('auth:start-microsoft', async () => {
    await authReady
    return authService.login()
  })

  ipcMain.handle('auth:logout', async () => {
    await authReady
    await authService.logout()
    return authService.getStatus()
  })
}

app.whenReady().then(async () => {
  const clientId = await loadMicrosoftClientId(app.getAppPath())
  const authService = new MicrosoftAuthService(
    clientId,
    path.join(app.getPath('userData'), 'auth', 'msal-cache.bin'),
  )
  const authReady = authService.initialize()

  registerIpcHandlers(authService, authReady)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
