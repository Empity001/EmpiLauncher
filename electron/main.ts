import { spawn } from 'node:child_process'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { detectCurseForge } from './curseforge/detection.js'
import { CurseForgeInstanceService } from './curseforge/instanceService.js'

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

const CURSEFORGE_DOWNLOAD_URL = 'https://www.curseforge.com/download/app'
const CURSEFORGE_OVERWOLF_APP_ID = 'cfiahnpaolfnlgaihhmobmnjdafknjnjdpdabpcm'

function registerIpcHandlers(instanceService: CurseForgeInstanceService) {
  ipcMain.handle('app:get-info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
  }))

  ipcMain.handle('pack:get-info', () => instanceService.getPackInfo())

  ipcMain.handle('curseforge:get-status', async () => {
    const detection = await detectCurseForge()
    if (detection.state !== 'detected') return detection
    return { state: detection.state, variant: detection.variant }
  })

  ipcMain.handle('curseforge:get-instance-status', () => instanceService.getStatus())
  ipcMain.handle('curseforge:install-instance', () => instanceService.installOrRepair())

  ipcMain.handle('curseforge:open-instance', async () => {
    const status = await instanceService.getStatus()
    if (status.state !== 'installed' && status.state !== 'update-available') {
      return { ok: false, message: 'Crea primero la instancia.' }
    }
    const error = await shell.openPath(status.path)
    return error ? { ok: false, message: error } : { ok: true }
  })

  ipcMain.handle('curseforge:open', async () => {
    const detection = await detectCurseForge()

    if (detection.state === 'unsupported') {
      return { ok: false, message: 'CurseForge solo se busca en Windows por ahora.' }
    }

    if (detection.state === 'not-found') {
      await shell.openExternal(CURSEFORGE_DOWNLOAD_URL)
      return { ok: true }
    }

    if (detection.variant === 'overwolf') {
      try {
        await new Promise<void>((resolve, reject) => {
          const child = spawn(
            detection.executablePath,
            ['-launchapp', CURSEFORGE_OVERWOLF_APP_ID, '-from-desktop'],
            { detached: true, stdio: 'ignore' },
          )
          child.once('spawn', () => {
            child.unref()
            resolve()
          })
          child.once('error', reject)
        })
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error
            ? error.message
            : 'No se pudo abrir CurseForge desde Overwolf.',
        }
      }
    }

    const error = await shell.openPath(detection.executablePath)
    return error ? { ok: false, message: error } : { ok: true }
  })
}

app.whenReady().then(async () => {
  const resourcesDirectory = app.isPackaged
    ? process.resourcesPath
    : app.getAppPath()
  const instanceService = new CurseForgeInstanceService(
    resourcesDirectory,
    (progress) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send('curseforge:install-progress', progress)
      }
    },
  )

  registerIpcHandlers(instanceService)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
