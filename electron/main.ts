import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { AuthResult, AuthStatus } from '../src/types/bridge.js'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const rendererDirectory = path.join(currentDirectory, '../dist')
const microsoftClientId = process.env.EMPILAUNCHER_MICROSOFT_CLIENT_ID?.trim()

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

  window.once('ready-to-show', () => window.show())

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void window.loadFile(path.join(rendererDirectory, 'index.html'))
  }
}

function registerIpcHandlers() {
  ipcMain.handle('app:get-info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
  }))

  ipcMain.handle('auth:get-status', (): AuthStatus => (
    microsoftClientId ? { state: 'ready' } : { state: 'not-configured' }
  ))

  ipcMain.handle('auth:start-microsoft', (): AuthResult => {
    if (!microsoftClientId) {
      return {
        ok: false,
        code: 'not-configured',
        message: 'Microsoft todavia no esta conectado a EmpiLauncher.',
      }
    }

    return {
      ok: false,
      code: 'not-implemented',
      message: 'La autenticacion se conectara en el siguiente paso.',
    }
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
